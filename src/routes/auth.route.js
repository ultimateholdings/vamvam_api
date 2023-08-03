const express = require("express");
const getAuthModule = require("../modules/auth.module");
const { errorHandler } = require("../utils/helpers");
const {carInfosValidator, hashedUploadHandler} = require("../utils/upload");

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
        routeModule.ensureUnregistered,
        hashedUploadHandler(fieldsOptions).single("carInfos"),
        routeModule.ensureValidDatas,
        errorHandler(routeModule.registerDriver)
    );
    return router;
}

module.exports = buildAuthRoutes;