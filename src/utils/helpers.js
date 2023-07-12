/*jslint
node
*/
"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const {getOTPConfig} = require("../utils/config")
const {
    TOKEN_EXP: expiration = 3600,
    JWT_SECRET: secret = "test1234butdefault"
} = process.env;

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

function errorHandler (func) {
    return async function (req, res, next) {
        try {
            await func(req, res, next);
        } catch (error) {
            res.status(500).json({
                code: (error.original || {}).errno,
                content: error.original
            });
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
        const {default: fetch} = await import("node-fetch");
        let response;
        try {
            response = await fetch(config.sent_url, {
                body: JSON.stringify(config.getSendingBody(phone, signature)),
                method: "POST"
            });
        } catch (error) {
            return {
                code: 501,
                message: "Something went wrong while sending OTP",
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
                code: 401,
                message: "The message could not be proceeded",
                sent: false
            };
        }

    }

    async function verifyOTP(phone, code) {
        const {default: fetch} = await import("node-fetch");
        let response = await model.findOne({where: {phone}});
        if (response === null) {
            return {
                errorCode: 445,
                message: "user has not request for OTP",
                verified: false
            };
        }
        try {
            response = await fetch(config.verify_url, {
                body: JSON.stringify(config.getVerificationBody(response.pinId, code)),
                method: "POST"
            });
            if (response.ok) {
                response = await response.json();
                if (response.verified === "True" && response.msisdn === phone) {
                    return {verified: true};
                }
                return {
                    errorCode: 448,
                    message: "invalid OTP, you may request for a new one"
                };
            } else {
                return {
                    errorCode: 446,
                    message: "the OTP is invalid, you may check again your pin",
                    verified: false
                };
            }
        } catch (error) {
            return {
                errorCode: 447,
                message: "something went wrong while verifying OTP",
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
    jwtWrapper,
    methodAdder,
    otpManager,
    propertiesPicker
});