/*jslint
node
*/
"use strict";
const {User, otpRequest} = require("../models");
const {defaultValues,errors} = require("../utils/config");
const {
    comparePassword,
    deleteFile,
    fileExists,
    getOTPService,
    jwtWrapper,
    otpManager,
    propertiesPicker,
    sendResponse
} = require("../utils/helpers");


function getAuthModule({
    model,
    otpHandler,
    tokenService
}) {
    const authModel = model || User;
    const authOtpHandler = otpHandler || otpManager(getOTPService(otpRequest));
    const authTokenService = tokenService || jwtWrapper();
    const otpAllowedRoles = ["client", "driver"];

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

    async function ensureValidDatas(req, res, next) {
        const requiredDatas = authModel.registrationDatas ?? [];
        let body;
        let hasFile;
        req.body.carInfos = req.file?.path;
        body = propertiesPicker(req.body)(requiredDatas);
        hasFile = await fileExists(body.carInfos);
        if (Object.keys(body).length !== requiredDatas.length || !hasFile) {
            sendResponse(res, errors.invalidValues);
        } else {
            req.body = body;
            next();
        }
    }

    async function ensureUnregistered(req, res, next) {
     const {phoneNumber: phone = null} = req.body;
     const user = await authModel.findOne({where: {phone}});
     if (user !== null) {
        sendResponse(res, errors.existingUser);
     } else {
        req.body.phone = phone;
        req.existingUser = false;
        next();
     }

    }
    
    async function registerDriver(req, res) {
        const {body} = req;
        body.status = authModel.statuses?.pendingValidation;
        await authModel.create(body);
        res.status(200).json({registred: true});
    }
    async function sendOTP(req, res) {
        const {phoneNumber, signature} = req.body;
        const {
            code,
            message,
            sent
        } = await authOtpHandler.sendCode(phoneNumber, signature);
        if (sent === true) {
            res.status(200).send({sent, ttl: defaultValues.ttl});
        } else {
            res.status(code).send({message});
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
        let otpResponse;
        if (role !== undefined && !otpAllowedRoles.includes(role)) {
            return sendResponse(res, errors.notAuthorized);
        }
        otpResponse = await authOtpHandler.verifyCode(phone, code);
        if (otpResponse.verified === true) {
            currentUser = await authModel.findOne({
                where: {phone}
            });
            if (currentUser === null) {
                currentUser = await authModel.create({phone, role});
                userExists = false;
            }
            sendSuccessResponse(res, currentUser, userExists);
        } else {
            res.status(otpResponse.errorCode).send({
                message: otpResponse.message,
                valid: false
            });
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
                return sendSuccessResponse(res, currentUser);
            }
        }
        sendResponse(res, errors.invalidCredentials);
    }
    return Object.freeze({
        ensureUnregistered,
        ensureValidDatas,
        loginUser,
        registerDriver,
        sendOTP,
        verifyOTP
    });
}

module.exports = getAuthModule;