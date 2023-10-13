/*jslint
node
*/
const express = require("express");
const getRegistrationModule = require("../modules/driver.module");
const {errorHandler} = require("../utils/helpers");
const {carInfosValidator, hashedUploadHandler} = require("../utils/upload");
const {
    allowRoles,
    parsePaginationHeaders,
    protectRoute
} = require("../utils/middlewares");
const {
    availableRoles: roles
} = require("../utils/config");

const fieldsOptions = {
    "carInfos": {
        folderPath: "public/registrations/",
        validator: carInfosValidator
    }
};

function buildRegistrationRoutes(module) {
    const routeModule = module || getRegistrationModule({});
    const router = new express.Router();

    router.get(
        "/registrations",
        protectRoute,
        allowRoles([roles.registrationManager]),
        parsePaginationHeaders,
        errorHandler(routeModule.getNewRegistrations)
    );
    router.get(
        "/all-settled",
        protectRoute,
        allowRoles([roles.registrationManager]),
        parsePaginationHeaders,
        errorHandler(routeModule.getSettled)
    );
    router.post(
        "/register",
        hashedUploadHandler(fieldsOptions).single("carInfos"),
        routeModule.ensureUnregistered,
        routeModule.ensureValidDatas,
        errorHandler(routeModule.registerDriver)
    );
    router.post(
        "/register-intern",
        protectRoute,
        allowRoles([roles.registrationManager]),
        hashedUploadHandler(fieldsOptions).single("carInfos"),
        routeModule.ensureValidDatas,
        routeModule.ensureUserNotExists,
        errorHandler(routeModule.registerIntern)
    );
    router.post(
        "/update-registration",
        protectRoute,
        allowRoles([roles.registrationManager]),
        hashedUploadHandler(fieldsOptions).single("carInfos"),
        routeModule.ensureRegistrationExists,
        routeModule.ensureIsGranted,
        errorHandler(routeModule.updateRegistration)
    );
    router.post(
        "/validate-registration",
        protectRoute,
        allowRoles([roles.registrationManager]),
        routeModule.ensureRegistrationExists,
        routeModule.ensureIsGranted,
        errorHandler(routeModule.validateRegistration)
    );
    router.post(
        "/reject-validation",
        protectRoute,
        allowRoles([roles.registrationManager]),
        routeModule.ensureRegistrationExists,
        routeModule.ensureIsGranted,
        routeModule.ensureNotValidated,
        errorHandler(routeModule.rejectRegistration)
    );
    router.post(
        "/handle-registration",
        protectRoute,
        allowRoles([roles.registrationManager]),
        routeModule.ensureRegistrationExists,
        routeModule.ensureNotValidated,
        routeModule.ensureNotHandled,
        errorHandler(routeModule.handleRegistration)
    );
    return router;
}

module.exports = buildRegistrationRoutes;