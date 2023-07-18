/*jslint
node
*/
"use strict";
const {User, otpRequest} = require("../models");
const {
    comparePassword,
    getOTPService,
    jwtWrapper,
    otpManager
} = require("../utils/helpers");


function getAuthModule({
    model,
    otpHandler,
    tokenService
}) {
    const authModel = model || User;
    const authOtpHandler = otpHandler || otpManager(getOTPService(otpRequest));
    const authTokenService = tokenService || jwtWrapper();

    function sendSuccessResponse(res, user, userExists) {
        const token = authTokenService.sign({
            id: user.id,
            phone: user.phone,
            role: user.role
        });
        let result = {token, valid: true};
        if (userExists !== undefined) {
            result.userExists = userExists;
        }
        res.status(200).json(result);
    }

    function sendFaillureResponse(res) {
        res.status(400).json({
            message: {
                en: "phone number or password is incorrect"
            }
        });
    }

    async function sendOTP(req, res) {
        const {phoneNumber, signature} = req.body;
        const {
            code,
            message,
            sent
        } = await authOtpHandler.sendCode(phoneNumber, signature);
        if (sent === true) {
            res.status(200).json({sent, ttl: 3});
        } else {
            res.status(code).json({message});
        }
    }

    async function verifyOTP(req, res) {
        const {
            code,
            phoneNumber: phone,
            role
        } = req.body;
        let currentUser;
        let userExists = true;
        let {
            errorCode = 400,
            message,
            verified
        } = await authOtpHandler.verifyCode(phone, code);
        if (verified === true) {
            currentUser = await authModel.findOne({
                where: {phone}
            });
            if (currentUser === null) {
                currentUser = await authModel.create({phone, role});
                userExists = false;
            }
            sendSuccessResponse(res, currentUser, userExists);
        } else {
            res.status(errorCode).json({valid: false, message});
        }
    }

    async function loginUser(req, res) {
        let {
            password,
            phoneNumber: phone
        } = req.body;
        let currentUser = await authModel.findOne({where: {phone}});
        let isVerified;
        if (currentUser !== null) {
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