const express = require("express");
const getAuthModule = require("../modules/auth.module");
const {errorHandler} = require("../utils/helpers");
const {protectRoute, registration, user} = require("../middlewares");
const {availableRoles} = require("../utils/config");

function buildAuthRoutes (authModule) {
    const routeModule = authModule || getAuthModule({});
    const router = new express.Router();
    const phoneGetter = (body) => Object.freeze({
        phone: body.phoneNumber ?? null
    });
    const phoneVerifier = user.lookupUser(phoneGetter);
    router.post(
        "/send-otp",
        routeModule.ensureUnregistered,
        errorHandler(routeModule.sendOTP)
    );
    router.post("/verify-otp", errorHandler(routeModule.verifyOTP));
    router.post(
        "/admin/login",
        phoneVerifier,
        routeModule.allowedRoles([
            availableRoles.adminRole,
            availableRoles.conflictManager,
            availableRoles.registrationManager
        ]),
        errorHandler(routeModule.loginUser)
    );
    router.post(
        "/client/login",
        phoneVerifier,
        routeModule.allowedRoles([availableRoles.clientRole]),
        errorHandler(routeModule.loginUser)
    );
    router.post(
        "/driver/login",
        phoneVerifier,
        registration.checkRegistration(
            (body) => Object.freeze({phoneNumber: body.phoneNumber})
        ),
        user.handlePendingRegistration,
        routeModule.allowedRoles([availableRoles.driverRole]),
        errorHandler(routeModule.loginUser)
    );
    router.post(
        "/send-reset-otp",
        phoneVerifier,
        errorHandler(routeModule.sendResetOTP)
    );
    router.post(
        "/verify-reset",
        phoneVerifier,
        routeModule.ensureHasReset,
        errorHandler(routeModule.verifyReset)
    );
    router.post(
        "/reset-password",
        routeModule.validateResetKey,
        errorHandler(routeModule.resetPassword)
    );
    router.post(
        "/change-password",
        protectRoute,
        errorHandler(routeModule.changePassword)
    );
    return router;
}

module.exports = buildAuthRoutes;