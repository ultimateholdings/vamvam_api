const express = require("express");
const getAuthModule = require("../modules/auth.module");
const { errorHandler } = require("../utils/helpers");
const {carInfosValidator, hashedUploadHandler} = require("../utils/upload");
const {protectRoute} = require("../utils/middlewares");

const fieldsOptions = {
    "carInfos": {
        folderPath: "public/uploads/",
        validator: carInfosValidator
    }
}

function buildAuthRoutes (authModule) {
    const routeModule = authModule || getAuthModule({});
    const router = new express.Router();
    router.post("/send-otp", errorHandler(routeModule.sendOTP));
    router.post("/verify-otp", errorHandler(routeModule.verifyOTP));
    router.post("/login", errorHandler(routeModule.loginUser));
    router.post(
        "/register",
        hashedUploadHandler(fieldsOptions).single("carInfos"),
        routeModule.ensureUnregistered,
        routeModule.ensureValidDatas,
        errorHandler(routeModule.registerDriver)
    );
    router.post(
        "/verify-reset",
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