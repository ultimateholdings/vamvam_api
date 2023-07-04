const express = require("express");
const getAuthModule = require("../modules/auth");


function buildAuthRoutes (authModule = getAuthModule({})) {
    const router = express.Router();
    router.post("/send-otp", authModule.sendOTP);
    router.post("/verify-otp", authModule.verifyOTP);
    router.post("/login", authModule.loginUser);
    return router;
}

module.exports = buildAuthRoutes;