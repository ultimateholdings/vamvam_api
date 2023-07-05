const express = require("express");
const getAuthModule = require("../modules/auth");


function buildAuthRoutes (authModule) {
    const routeModule = authModule || getAuthModule({});
    const router = express.Router();
    router.post("/send-otp", routeModule.sendOTP);
    router.post("/verify-otp", routeModule.verifyOTP);
    router.post("/login", routeModule.loginUser);
    return router;
}

module.exports = buildAuthRoutes;