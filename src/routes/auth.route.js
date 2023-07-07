const express = require("express");
const getAuthModule = require("../modules/auth.module");
const { errorHandler } = require("../utils/helpers");


function buildAuthRoutes (authModule) {
    const routeModule = authModule || getAuthModule({});
    const router = express.Router();
    router.post("/send-otp", errorHandler(routeModule.sendOTP));
    router.post("/verify-otp", errorHandler(routeModule.verifyOTP));
    router.post("/login", errorHandler(routeModule.loginUser));
    return router;
}

module.exports = buildAuthRoutes;