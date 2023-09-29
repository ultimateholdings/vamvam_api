const express = require("express");
const getAuthModule = require("../modules/auth.module");
const {errorHandler} = require("../utils/helpers");
const {protectRoute} = require("../utils/middlewares");
const {availableRoles} = require("../utils/config");

function buildAuthRoutes (authModule) {
    const routeModule = authModule || getAuthModule({});
    const router = new express.Router();
    router.post(
        "/send-otp",
        routeModule.ensureUnregistered,
        errorHandler(routeModule.sendOTP)
    );
    router.post("/verify-otp", errorHandler(routeModule.verifyOTP));
    router.post(
        "/admin/login",
        routeModule.ensureExistingAccount,
        routeModule.allowedRoles([
            availableRoles.adminRole,
            availableRoles.conflictManager,
            availableRoles.registrationManager
        ]),
        errorHandler(routeModule.loginUser)
    );
    router.post(
        "/client/login",
        routeModule.ensureExistingAccount,
        routeModule.allowedRoles([availableRoles.clientRole]),
        errorHandler(routeModule.loginUser)
    );
    router.post(
        "/driver/login",
        routeModule.ensureExistingAccount,
        routeModule.allowedRoles([availableRoles.driverRole]),
        errorHandler(routeModule.loginUser)
    );
    router.post(
        "/send-reset-otp",
        routeModule.ensureExistingAccount,
        errorHandler(routeModule.sendResetOTP)
    );
    router.post(
        "/verify-reset",
        routeModule.ensureExistingAccount,
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