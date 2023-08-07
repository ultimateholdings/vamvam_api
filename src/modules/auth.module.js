/*jslint
node
*/
"use strict";
const {User, otpRequest} = require("../models");
const {availableRoles, defaultValues,errors} = require("../utils/config");
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
    const authTokenService = tokenService || jwtWrapper;
    const otpAllowedRoles = ["client", "driver"];
    const otpResetRoles = [
        availableRoles.driverRole,
        availableRoles.adminRole
    ];

    function handleAuthSuccess(res, user, userExists) {
        const tokenFactory = authTokenService();
        const token = tokenFactory.sign({
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

    function sendResetSuccess(res, user) {
        const tokenFactory = authTokenService(600000)
        const resetToken = tokenFactory.sign({
            phone: user.phone
        });
        return res.status(200).send({resetToken});
    }

    async function validateResetKey(req, res, next) {
        const {key} = req.body;
        const tokenFactory = authTokenService();
        let payload;
        
        try {
            payload = await tokenFactory.verify(key);
            if (payload.valid === true) {
                req.user = payload;
                next();
            } else {
                sendResponse(res, errors.tokenInvalid);
            }
        } catch (error) {
            sendResponse(res, errors.notAuthorized, error);
        }
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

    async function changePassword(req, res) {
        const {id, phone, role} = req.user.token;
        const {newPassword, oldPassword} = req.body;
        const currentUser = await authModel.findOne({where: {id, phone}});
        let isValidPassword;

        if (!otpResetRoles.includes(role)) {
            return sendResponse(res, errors.notAuthorized);
        }
        isValidPassword = await comparePassword(oldPassword, currentUser.password);
        if (!isValidPassword) {
            return sendResponse(res, errors.invalidCredentials);
        }
        await authModel.update({password: newPassword}, {
            individualHooks: true,
            where: {id, phone}
        });
        res.status(200).send({updated: true});
    }
    
    async function registerDriver(req, res) {
        const {body} = req;
        body.status = authModel.statuses?.pendingValidation;
        await authModel.create(body);
        res.status(200).json({registered: true});
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

    async function verifyReset(req, res) {
        const {
            code,
            phoneNumber: phone
        } = req.body;
        let currentUser;
        let response = await authOtpHandler.verifyCode(phone, code);
        if (response.verified === false) {
            return res.status(response.errorCode).send({
                message: response.message
            });
        }
        currentUser = await authModel.findOne({where: {phone}});
        if (currentUser === null) {
            return sendResponse(res, errors.notFound);
        }
        if(currentUser.status !== authModel.statuses?.activated) {
            return sendResponse(res, errors.inactiveAccount);
        }
        
        if (!otpResetRoles.includes(currentUser.role)) {
            return sendResponse(res, errors.notAuthorized);
        }

        sendResetSuccess(res, currentUser);
    }

    async function resetPassword (req, res) {
        const {phone} = req.user.token;
        const {password} = req.body;
        await authModel.update({password}, {
                individualHooks: true,
                where: {phone}
        });
        res.status(200).send({updated: true})
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
        if (otpResponse.verified === false) {
            return res.status(otpResponse.errorCode).send({
                message: otpResponse.message,
                valid: false
            });
        }
        currentUser = await authModel.findOne({where: {phone}});
        if (currentUser === null) {
            currentUser = await authModel.create({
                phone,
                role: availableRoles.clientRole,
                status: authModel.statuses?.activated
            });
            userExists = false;
        }
        handleAuthSuccess(res, currentUser, userExists);
    }

    async function loginUser(req, res) {
        let {
            password,
            phoneNumber: phone
        } = req.body;
        let currentUser = await authModel.findOne({where: {phone}});
        let isVerified;
        if (currentUser !== null) {
            if (currentUser.status === authModel.statuses?.pendingValidation) {
                return sendResponse(res, errors.inactiveAccount);
            }
            isVerified = await comparePassword(password, currentUser.password);
            if (isVerified) {
                return handleAuthSuccess(res, currentUser);
            }
        }
        sendResponse(res, errors.invalidCredentials);
    }
    return Object.freeze({
        changePassword,
        ensureUnregistered,
        ensureValidDatas,
        loginUser,
        registerDriver,
        resetPassword,
        sendOTP,
        validateResetKey,
        verifyOTP,
        verifyReset
    });
}

module.exports = getAuthModule;