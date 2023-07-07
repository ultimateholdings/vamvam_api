/*jslint
node
*/
"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
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

function getOTPService() {
    function sendOTP() {
        return Promise.resolve(true);
    }

    function verifyOTP() {
        return Promise.resolve(true);
    }

    return Object.freeze({sendOTP, verifyOTP});
}

function otpManager(otpService = getOTPService()) {
    return {
        sendCode: function (phoneNumber) {
            return otpService.sendOTP(phoneNumber);
        },
        verifyCode: async function (phoneNumber, code) {
            let isVerified = await otpService.verifyOTP(phoneNumber, code);
            return isVerified;
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