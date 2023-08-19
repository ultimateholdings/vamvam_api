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
const {errors, getFirebaseConfig, getOTPConfig} = require("../utils/config");
const {ValidationError} = require("sequelize");
const {
    TOKEN_EXP: expiration = 3600,
    JWT_SECRET: secret = "test1234butdefault"
} = process.env;

const CustomEmitter = function (name) {
    this.name = name;
};
CustomEmitter.prototype = EventEmitter.prototype;

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
        lineString = {
            type: "LineString",
        };
        lineString.coordinates = points.map(function (point) {
            if (isValidLocation(point)) {
                return [point.latitude, point.longitude];
            }
            throw new Error("Invalid location !!!");
        })
    }
    return lineString;
}

function formatDbLineString(lineString) {
    let result = null;
    if (lineString !== null && lineString !== undefined) {
        result = lineString.coordinates?.map?.(
            ([latitude, longitude]) => {latitude, longitude}
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
    return async function (req, res, next) {
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
                res.status(err.status).json({
                    content,
                    message: err.message
                });

            } else {
                err = errors.internalError;
                res.status(err.status).json({
                    code: error.original?.errno,
                    content: error.original,
                    message: err.message
                });
            }
            res.end();
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
    async function sendOTP(phone, signature) {
        let response;
        try {
            response = await fetchUrl({
                body: config.getSendingBody(phone, signature),
                url: config.sent_url
            });
        } catch (error) {
            response = errors.internalError;
            console.error(error);
            return {
                code: response.status,
                message: response.message,
                sent: false
            };
        }
        if (response.ok) {
            response = await response.json();
            await model.upsert({phone, pinId: response.pinId}, {where: phone});
            return {sent: true};
        } else {
            response = await response.json();
            return {
                code: errors.otpSendingFail.status,
                content: response.message,
                message: errors.otpSendingFail.message,
                sent: false
            };
        }

    }

    async function verifyOTP(phone, code) {
        let response = await model.findOne({where: {phone}});
        if (response === null) {
            return {
                errorCode: errors.requestOTP.status,
                message: errors.requestOTP.message,
                verified: false
            };
        }
        try {
            response = await fetchUrl({
                body: config.getVerificationBody(response.pinId, code),
                url: config.verify_url
            });
            if (response.ok) {
                response = await response.json();
                if (response.verified && response.msisdn === phone) {
                    await model.destroy({where: {phone}});
                    return {verified: true};
                }
                return {
                    errorCode: errors.notAuthorized.status,
                    message: errors.notAuthorized.message
                };
            } else {
                return {
                    errorCode: errors.invalidCredentials.status,
                    message: errors.invalidCredentials.message,
                    verified: false
                };
            }
        } catch (error) {
            return {
                errorCode: errors.internalError.status,
                message: errors.internalError.message,
                sysCode: error.code,
                verified: false
            };
        }
    }

    return Object.freeze({sendOTP, verifyOTP});
}

function otpManager(otpService) {
    return {
        sendCode: function (phoneNumber, signature) {
            return otpService.sendOTP(phoneNumber, signature);
        },
        verifyCode: function (phoneNumber, code) {
            return otpService.verifyOTP(phoneNumber, code);
        }
    };
}

function ressourcePaginator(getRessources, expiration = 3600000) {
    const tokenManager = jwtWrapper(expiration);
    async function handleInvalidToken(maxSize) {
        const {lastId, values} = await getRessources({maxSize, offset: 0});
        const nextPageToken = tokenManager.sign({
            lastId,
            offset: 1
        });
        return {nextPageToken, results: values};
    }

    async function handleValidToken(tokenDatas, maxSize) {
        let nextPageToken;
        let results = await getRessources({
            maxSize,
            offset: tokenDatas.offset
        });
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

    return async function paginate(pageToken, maxPageSize) {
        let datas;
        let results;
        try {
            datas = await tokenManager.verify(pageToken);
            if (datas.valid) {
                results = await handleValidToken(datas.token, maxPageSize);
            } else {
                results = await handleInvalidToken(maxPageSize);
            }
        } catch (err) {
            console.error(err);
            results = await handleInvalidToken(maxPageSize);
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
    formatDbPoint,
    formatDbLineString,
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
    otpManager,
    pathToURL,
    propertiesPicker,
    ressourcePaginator,
    sendCloudMessage,
    sendResponse,
    toDbPoint,
    toDbLineString
});