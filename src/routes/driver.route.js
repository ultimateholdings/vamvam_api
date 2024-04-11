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
    protectRoute,
    registration,
    user,
} = require("../middlewares");
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
    const middleware = registration;

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
        middleware.ensureUnregistered,
        middleware.ensureValidDatas,
        errorHandler(routeModule.registerDriver)
    );
    router.post(
        "/register-intern",
        protectRoute,
        allowRoles([roles.registrationManager]),
        hashedUploadHandler(fieldsOptions).single("carInfos"),
        middleware.ensureValidDatas,
        user.lookupUser(null, "driver"),
        errorHandler(routeModule.registerIntern)
    );
    router.post(
        "/update-registration",
        protectRoute,
        allowRoles([roles.registrationManager]),
        hashedUploadHandler(fieldsOptions).single("carInfos"),
        middleware.ensureRegistrationExists,
        middleware.ensureIsGranted,
        errorHandler(routeModule.updateRegistration)
    );
    router.post(
        "/validate-registration",
        protectRoute,
        allowRoles([roles.registrationManager]),
        middleware.ensureRegistrationExists,
        middleware.ensureIsGranted,
        errorHandler(routeModule.validateRegistration)
    );
    router.post(
        "/reject-registration",
        protectRoute,
        allowRoles([roles.registrationManager]),
        middleware.ensureRegistrationExists,
        middleware.ensureIsGranted,
        middleware.ensureNotValidated,
        errorHandler(routeModule.rejectRegistration)
    );
    router.post(
        "/handle-registration",
        protectRoute,
        allowRoles([roles.registrationManager]),
        middleware.ensureRegistrationExists,
        middleware.ensureNotValidated,
        middleware.ensureNotHandled,
        errorHandler(routeModule.handleRegistration)
    );
    return router;
}

module.exports = buildRegistrationRoutes;
