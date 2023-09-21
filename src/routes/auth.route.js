const express = require("express");
const getAuthModule = require("../modules/auth.module");
const { errorHandler } = require("../utils/helpers");
const {protectRoute} = require("../utils/middlewares");

function buildAuthRoutes (authModule) {
    const routeModule = authModule || getAuthModule({});
    const router = new express.Router();
    router.post(
        "/send-otp",
        routeModule.ensureUnregistered,
        errorHandler(routeModule.sendOTP)
    );
    router.post("/verify-otp", errorHandler(routeModule.verifyOTP));
    router.post("/login", errorHandler(routeModule.loginUser));
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