/*jslint
node
*/
"use strict";
const {User} = require("../models");
const {
    comparePassword,
    jwtWrapper,
    otpManager
} = require("../utils/helpers");


function getAuthModule({
    model,
    otpHandler,
    tokenService
}) {
    const authModel = model || User;
    const authOtpHandler = otpHandler || otpManager();
    const authTokenService = tokenService || jwtWrapper();

    function sendSuccessResponse(res, user, userExists) {
        const token = authTokenService.sign({
            id: user.userId,
            phone: user.phone
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
        const {phoneNumber} = req.body;
        await authOtpHandler.sendCode(phoneNumber);
        res.status(200).json({sent: true});
    }

    async function verifyOTP(req, res) {
        const {
            code,
            phoneNumber: phone
        } = req.body;
        let currentUser;
        let isVerified;
        let userExists = true;
        isVerified = await authOtpHandler.verifyCode(phone, code);
        if (isVerified) {
            currentUser = await authModel.findOne({
                where: {phone}
            });
            if (currentUser === null) {
                currentUser = await authModel.create({phone});
                userExists = false;
            }
            sendSuccessResponse(res, currentUser, userExists);
        } else {
            res.status(400).json({valid: false});
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