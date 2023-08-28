/*jslint
node, this
*/
"use strict";
const {EventEmitter} = require("node:events");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
    defaultValues,
    errors,
    getFirebaseConfig,
    getOTPConfig
} = require("../utils/config");
const {ValidationError} = require("sequelize");
const {
    TOKEN_EXP: expiration = 3600,
    JWT_SECRET: secret = "test1234butdefault"
} = process.env;

const CustomEmitter = function (name) {
    this.name = name;
};
CustomEmitter.prototype = EventEmitter.prototype;

function cloneObject(object) {
    const tmp = Object.create(null);
    Object.assign(tmp, object);
    return tmp;
}

function fileExists(path) {
    if (typeof path === "string") {
        return new Promise(function (res) {
            fs.access(path, fs.constants.F_OK, function (err) {
                if (err) {
                    res(false);
                } else {
                    res(true);
                }
            });
        });
    } else {
        return Promise.resolve(false);
    }
}

function deleteFile(path) {
    if (typeof path === "string") {
        return new Promise(function (res) {
            fs.unlink(path, function (err) {
                if (err) {
                    res(false);
                }
                res(true);
            });
        });
    }
    return Promise.resolve(false);
}

function jwtWrapper(expiresIn = expiration) {
    return {
        sign(payload) {
            return jwt.sign(payload, secret, {expiresIn});
        },
        verify: async function (token) {
            let verifiedToken;
            try {
                verifiedToken = await new Promise(
                    function tokenExecutor(res, rej) {
                        jwt.verify(token, secret, function (err, decoded) {
                            if (decoded === undefined) {
                                rej(err);
                            } else {
                                res(decoded);
                            }
                        });
                    }
                );
                return {token: verifiedToken, valid: true};
            } catch (error) {
                return {errorCode: error.code, valid: false};
            }
        }
    };
}

function methodAdder(object) {
    return function addMethod(name, func) {
        if (!object.hasOwnProperty(name)) {
            object.prototype[name] = func;
        }
    };
}
function sendResponse(res, content, data = {}) {
    res.status(content.status).send({
        data,
        message: content.message
    });
}

function isValidPoint(point) {
    if (point !== null && point !== undefined) {
        return (
            Number.isFinite(point.latitude) &&
            Number.isFinite(point.longitude)
        );
    }
    return false;
}

function toDbPoint(point) {
    return {
        coordinates: [point?.latitude, point?.longitude],
        type: "Point"
    };
}

function toDbLineString(points) {
    let lineString;
    if (Array.isArray(points)) {
        lineString = {type: "LineString"};
        lineString.coordinates = points.map(function (point) {
            if (isValidLocation(point)) {
                return [point.latitude, point.longitude];
            }
            throw new Error("Invalid location !!!");
        });
    }
    return lineString;
}

function formatDbLineString(lineString) {
    let result = null;
    if (lineString !== null && lineString !== undefined) {
        result = lineString.coordinates.map(
            function ([latitude, longitude]) {
                return Object.freeze({latitude, longitude});
            }
        );
    }
    return result;
}

function formatDbPoint(dbPoint) {
    let result = null;
    if (dbPoint !== null && dbPoint !== undefined) {
        result = {
            latitude: dbPoint.coordinates[0],
            longitude: dbPoint.coordinates[1]
        };
    }
    return result;
}

function isValidLocation(location) {
    let result;
    if (Array.isArray(location)) {
        result = location.every(isValidPoint);
    } else if (location !== null && location !== undefined) {
        result = isValidPoint(location);
    }
    return result;
}

function getFileHash(path) {
    return new Promise(function executor(res, rej) {
        const stream = fs.createReadStream(path);
        const hash = crypto.createHash("sha256");
        stream.on("readable", function () {
            const data = stream.read();
            if (data !== null) {
                hash.update(data);
            } else {
                res(hash.digest("hex"));
                stream.close();
            }
        });
        stream.on("error", function (err) {
            rej(err);
        });
    });
}

async function fetchUrl({
    body = {},
    headers = {"content-type": "application/json"},
    method = "POST",
    url
}) {
    const {
        default: fetch
    } = await import("node-fetch");
    return fetch(url, {
        body: JSON.stringify(body),
        headers,
        method
    });
}

function errorHandler(func) {
    return async function handleEndPoint(req, res, next) {
        let err;
        let content;
        try {
            await func(req, res, next);
        } catch (error) {
            if (ValidationError.prototype.isPrototypeOf(error)) {
                err = errors.invalidValues;
                content = error.errors.map(function ({message}) {
                    return message.replace(/^\w*\./, "");
                }, {}).join(" and ");
                return sendResponse(res, err, content);
            } else {
                err = errors.internalError;
                return sendResponse(res, err);
            }
        }
    };
}

function propertiesPicker(object) {
    return function (props) {
        let result;
        if (typeof object === "object") {
            result = Object.entries(object).reduce(function (acc, entry) {
                let [key, value] = entry;
                if (
                    props.includes(key) &&
                    (value !== null && value !== undefined)
                ) {
                    acc[key] = value;
                }
                return acc;
            }, Object.create(null));
        }
        if (Object.keys(result || {}).length > 0) {
            return result;
        }
    };
}

function getOTPService(model) {
    const config = getOTPConfig();
    async function sendCode({
        phone,
        signature,
        type = "auth"
    }) {
        let response;
        let content;
        const ttlInSeconds = defaultValues.ttl;
        response = await model.canRequest({phone, ttlInSeconds, type});
        if (!response) {
            response = cloneObject(errors.ttlNotExpired);
            response.sent = false;
            return response;
        }
        try {
            response = await fetchUrl({
                body: config.getSendingBody(phone, signature),
                url: config.sent_url
            });
        } catch (error) {
            response = cloneObject(errors.internalError);
            response.sent = false;
            response.content = error.toString();
            return response;
        }
        if (response.ok) {
            response = await response.json();
            await model.upsert({
                phone,
                pinId: response.pinId,
                type
            }, {where: {phone, type}});
            return {pinId: response.pinId, sent: true};
        } else {
            response = await response.json();
            content = cloneObject(errors.otpSendingFail);
            content.sent = false;
            content.content = response.message;
            return content;
        }
    }

    async function verifyCode({
        code,
        phone,
        type = "auth"
    }) {
        let response = await model.findOne({where: {phone, type}});
        if (response === null) {
            response = cloneObject(errors.requestOTP);
            response.verified = false;
            return response;
        }
        try {
            response = await fetchUrl({
                body: config.getVerificationBody(response.pinId, code),
                url: config.verify_url
            });
            if (response.ok) {
                response = await response.json();
                if (response.verified && response.msisdn === phone) {
                    await model.destroy({where: {phone, type}});
                    return {verified: true};
                }
                response = cloneObject(errors.forbiddenAccess);
                response.verified = false;
                return response;
            } else {
                response = cloneObject(errors.invalidCredentials);
                response.verified = false;
                return response;
            }
        } catch (error) {
            response = cloneObject(errors.internalError);
            response.content = error.toString();
            response.verified = false;
            return response;
        }
    }

    return Object.freeze({sendCode, verifyCode});
}


function ressourcePaginator(getRessources, expiration = 3600000) {
    const tokenManager = jwtWrapper(expiration);
    async function handleInvalidToken(maxSize, getParams) {
        const {lastId, values} = await getRessources(
            getParams({maxSize, offset: 0})
        );
        const nextPageToken = tokenManager.sign({
            lastId,
            offset: 1
        });
        return {nextPageToken, results: values};
    }

    async function handleValidToken(tokenDatas, maxSize, getParams) {
        let nextPageToken;
        let results = await getRessources(getParams({
            maxSize,
            offset: tokenDatas.offset
        }));
        nextPageToken = (
            results.values.length < 1
            ? null
            : tokenManager.sign({
                lastId: results.lastId,
                offset: tokenDatas.offset + 1
            })
        );
        if (results.formerLastId !== tokenDatas.lastId) {
            results = await handleInvalidToken(maxSize);
        } else {
            results = {
                nextPageToken,
                results: results.values
            };
        }
        return results;
    }

    return async function paginate(
        pageToken,
        maxPageSize,
        getParams = cloneObject
    ) {
        let datas;
        let results;
        try {
            datas = await tokenManager.verify(pageToken);
            if (datas.valid) {
                results = await handleValidToken(
                    datas.token,
                    maxPageSize,
                    getParams
                );
            } else {
                results = await handleInvalidToken(maxPageSize, getParams);
            }
        } catch (err) {
            console.error(err);
            results = await handleInvalidToken(maxPageSize, getParams);
        }
        return results;
    };
}

function sendCloudMessage({body, meta, title, to}) {
    const config = getFirebaseConfig();
    return fetchUrl({
        body: {
            data: meta,
            notification: {
                body,
                "mutable_content": true,
                title
            },
            to
        },
        headers: config.headers,
        url: config.url
    });
}

function pathToURL(filePath) {
    let rootDir;
    if (typeof filePath === "string" && filePath.length > 0) {
        rootDir = path.normalize(
            path.dirname(filePath)
        ).split(path.sep).at(-1);
        return "/" + rootDir + "/" + path.basename(filePath);
    }
}

module.exports = Object.freeze({
    CustomEmitter,
    comparePassword(givenPassword, hash) {
        return new Promise(function executor(resolve, reject) {
            bcrypt.compare(givenPassword, hash, function (err, result) {
                if (err !== null && err !== undefined) {
                    reject(err);
                }
                resolve(result === true);
            });
        });
    },
    deleteFile,
    errorHandler,
    fileExists,
    formatDbLineString,
    formatDbPoint,
    getFileHash,
    getOTPService,
    hashPassword(password) {
        return new Promise(function executor(resolve, reject) {
            bcrypt.hash(password, 10, function (err, result) {
                if (err !== null && err !== undefined) {
                    reject(err);
                }
                resolve(result);
            });
        });
    },
    isValidLocation,
    jwtWrapper,
    methodAdder,
    pathToURL,
    propertiesPicker,
    ressourcePaginator,
    sendCloudMessage,
    sendResponse,
    toDbLineString,
    toDbPoint
});