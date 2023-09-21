/*jslint
node
*/
"use strict";
const {User, otpRequest} = require("../models");
const {errors} = require("../utils/system-messages");
const {
    availableRoles,
    otpTypes
} = require("../utils/config");
const {
    comparePassword,
    getOTPService,
    jwtWrapper,
    sendResponse
} = require("../utils/helpers");


function getAuthModule({
    associatedModels,
    model,
    otpHandler,
    tokenService
}) {
    const associations = associatedModels || {otp: otpRequest};
    const authModel = model || User;
    const authOtpHandler = otpHandler || getOTPService(otpRequest);
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
        const tokenFactory = authTokenService(600000); //expires in 5min
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

    async function ensureExistingAccount(req, res, next) {
        const {phone, phoneNumber} = req.body;
        const user = await authModel.findOne({where: {
            phone: phone ?? phoneNumber
        }});
        if (user === null) {
            return sendResponse(res, errors.notFound, {phone});
        }
        req.user = user;
        next();
    }

    async function ensureHasReset(req, res, next) {
        const {
            phoneNumber: phone
        } = req.body;
        const request = await associations.otp.findOne({
            where: {
                phone,
                type: otpTypes.reset
            }
        });
        if (request === null) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        req.otpRequest = request;
        next();
    }

    async function ensureUnregistered(req, res, next) {
        const {
            phoneNumber: phone = null
        } = req.body;
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

        if (!otpResetRoles.includes(role) || id !== currentUser.id) {
            return sendResponse(res, errors.forbiddenAccess);
        }
        isValidPassword = await comparePassword(
            oldPassword,
            currentUser.password
        );
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
        const {
            phoneNumber: phone,
            signature
        } = req.body;
        const response = await authOtpHandler.sendCode({phone, signature});
        if (response.sent === true) {
            res.status(200).send({sent: true, ttl: authOtpHandler.getTtl()});
        } else {
            sendResponse(res, response);
        }
    }

    async function sendResetOTP(req, res) {
        const {
            phoneNumber: phone,
            signature
        } = req.body;
        const response = await authOtpHandler.sendCode({
            phone,
            signature,
            type: otpTypes.reset
        });
        if (response.sent === true) {
            res.status(200).send({sent: true, ttl: authOtpHandler.getTtl()});
        } else {
            return sendResponse(res, response);
        }
    }

    async function verifyReset(req, res) {
        const {
            code,
            phoneNumber: phone
        } = req.body;
        let {user} = req;
        let response;
        if (user.status !== authModel.statuses?.activated) {
            return sendResponse(res, errors.inactiveAccount);
        }

        if (!otpResetRoles.includes(user.role)) {
            return sendResponse(res, errors.forbiddenAccess);
        }
        response = await authOtpHandler.verifyCode({
            code,
            phone,
            type: otpTypes.reset
        });
        if (response.verified === false) {
            return sendResponse(res, response);
        }
        sendResetSuccess(res, user);
    }

    async function resetPassword(req, res) {
        const {phone} = req.user.token;
        const {password} = req.body;
        await authModel.update({password}, {
            individualHooks: true,
            where: {phone}
        });
        res.status(200).send({updated: true});
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
            return sendResponse(res, errors.forbiddenAccess);
        }
        otpResponse = await authOtpHandler.verifyCode({code, phone});
        if (otpResponse.verified === false) {
            return sendResponse(res, otpResponse);
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
        if (currentUser?.status !== authModel.statuses?.activated) {
            return sendResponse(res, errors.inactiveAccount);
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
            if (currentUser.status !== authModel.statuses?.activated) {
                return sendResponse(res, errors.inactiveAccount);
            }
            if (currentUser.password === null) {
                return sendResponse(res, errors.forbiddenAccess);
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
        ensureExistingAccount,
        ensureHasReset,
        ensureUnregistered,
        loginUser,
        registerDriver,
        resetPassword,
        sendOTP,
        sendResetOTP,
        validateResetKey,
        verifyOTP,
        verifyReset
    });
}

module.exports = getAuthModule;