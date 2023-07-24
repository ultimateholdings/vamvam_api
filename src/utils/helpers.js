/*jslint
node
*/
"use strict";
const {EventEmitter} = require("node:events");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const {getOTPConfig, errors} = require("../utils/config");
const {ValidationError} = require("sequelize");
const {
    TOKEN_EXP: expiration = 3600,
    JWT_SECRET: secret = "test1234butdefault"
} = process.env;

const defaultHeader = {
    "content-type": "application/json",
};

const CustomEmitter = new Function();
CustomEmitter.prototype = EventEmitter.prototype;

function jwtWrapper() {
    return {
        sign(payload) {
            return jwt.sign(payload, secret, {expiresIn: expiration});
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

function isValidLocation(location) {
    let result;
    function isValidPoint({latitude, longitude}) {
        return Number.isFinite(latitude) && Number.isFinite(longitude);
    }
    if (Array.isArray(location)) {
        result = location.every(function (point) {
            if (point !== null && point !== undefined) {
                return isValidPoint(point);
            }
            return false;
        });
    } else  if (location !== null && location !== undefined){
        return isValidPoint(location)
    }
    return false;
}

function getFileHash (path) {
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

async function fetchUrl(url, body={}, headers = defaultHeader) {
    const {default: fetch} = await import("node-fetch");
    return  fetch(url, {
        body: JSON.stringify(body),
        headers,
        method: "POST"
    });
    
}

function errorHandler (func) {
    return async function (req, res, next) {
        let err;
        let content;
        try {
            await func(req, res, next);
        } catch (error) {
            if (error instanceof ValidationError) {
                err = errors.invalidValues
                content =  error.errors.map(function ({message}) {
                    return message.replace(/^\w*\./, "");
                }, {}).join(" and ");
                res.status(err.status).json({
                    content,
                    message: err.message
                });

            } else {
                err = errors.internalError;
                res.status(err.status).json({
                    code: (error.original || {}).errno,
                    content: error.original,
                    message: err.message
                });
            }
            res.end();
        }
    }
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
            response = await fetchUrl(
                config.sent_url,
                config.getSendingBody(phone, signature)
            );
        } catch (error) {
            response = errors.internalError;
            return {
                code: response.status,
                message: response.message,
                sent: false
            };
        }
        if (response.ok) {
            response = await response.json();
            await model.upsert({pinId: response.pinId, phone}, {where: phone});
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
            response = await fetchUrl(
                config.verify_url,
                config.getVerificationBody(response.pinId, code)
            );
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
                verified: false,
                sysCode: error.code
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
    errorHandler,
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
    propertiesPicker
});