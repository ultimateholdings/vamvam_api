/*jslint
node
*/

"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
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
        if (typeof object === "object" && !object.hasOwnProperty(name)) {
            object.prototype[name] = func;
        }
    };
}

function propertiesPicker(object) {
    return function (...props) {
        if (typeof object === "object") {
            return Object.entries(object).reduce(function (acc, entry) {
                let [key, value] = entry;
                if (
                    props.includes(key) &&
                    (value !== null || value !== undefined)
                ) {
                    acc[key] = value;
                }
                return acc;
            }, {});
        }
        return {};
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
        sendCode: async function (phoneNumber) {
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
                if (err !== null || err !== undefined) {
                    reject(err);
                }
                resolve(result === true);
            });
        });
    },
    hashPassword(password) {
        return new Promise(function executor(resolve, reject) {
            bcrypt.hash(password, 10, function (err, result) {
                if (err !== null || err !== undefined) {
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