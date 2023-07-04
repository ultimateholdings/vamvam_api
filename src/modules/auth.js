"use strict";
const jwt = require("jsonwebtoken");
const {
    JWT_SECRET:secret="test1234butdefault",
    TOKEN_EXP:expiration=3600
} = process.env;
const {getOTPService} = require("../utils/helpers");
const {User} = require("../models");
const {comparePassword} = require("../utils/helpers");

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

function jwtWrapper(){
    return {
        sign(payload) {
            return jwt.sign(payload,secret,{expiresIn: expiration});
        },
        async verify(token) {
            let verifiedToken;
            try {
                verifiedToken = await new Promise(function tokenExecutor(res, rej) {
                    jwt.verify(token, secret, function (err, decoded) {
                        if (decoded === undefined) {
                            rej(err);
                        } else {
                            res(decoded);
                        }
                    });
                });
                return {valid: true, token: verifiedToken};
            } catch (error) {
                return {valid: false};
            }
        }
    }    
}


function getAuthModule({
    otpHandler = otpManager(),
    tokenService = jwtWrapper(),
    model = User
}) {
    function sendSuccessResponse(res, user, userExists) {
        const token = tokenService.sign({
            id: user.userId,
            phone: user.phone
        });
        let result = {token, valid: true};
        if (userExists != null) {
            result.userExists = userExists;
        }
        res.status(200).json(result);
    }

    function sendFaillureResponse(res) {
        res.status(400).json({
            message: {
                en: "phone number or password is incorrect"
            }
        })
    }

    async function sendOTP(req, res) {
        const {phoneNumber} = req.body;
        try {
            await otpHandler.sendCode(phoneNumber);
            res.status(200).json({sent: true});
        } catch (error) {
            res.status(500).json({
                message: "something went wrong while sending OTP"
            });
        }
    }
    
    async function verifyOTP (req, res) {
        const {phoneNumber: phone, code} = req.body;
        let currentUser;
        let isVerified;
        let userExists = true;
        try {
            isVerified = await otpHandler.verifyCode(phone, code);
            if (isVerified) {
                currentUser = await model.findOne({
                    where: {phone}
                });
                if (currentUser === null) {
                    currentUser = model.create({phone});
                    userExists = false
                }
                sendSuccessResponse(res, currentUser, userExists);
            } else {
                res.status(400).json({valid: false});
            }
        } catch (_) {
            res.status(500).json({
                message: "Something went wrong while verifying the OTP"
            });
        }
    }
    

    async function  loginUser (req, res) {
        let {phoneNumber: phone, password} = req.body;
        let currentUser = await model.findOne({where: {phone}});
        let isVerified;
        if (currentUser != null) {
            isVerified = await comparePassword(password, currentUser.password);
            if (isVerified) {
               sendSuccessResponse(res, currentUser);
            } else {
                sendFaillureResponse(res);
            }
        } else {
            sendFaillureResponse(res);
        }
    }
    return Object.freeze({
        loginUser,
        sendOTP,
        verifyOTP
    });
}

module.exports = getAuthModule;