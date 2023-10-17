/*jslint
node
*/
const express = require("express");
const getUserModule = require("../modules/user.module");
const {
    allowRoles,
    parsePaginationHeaders,
    protectRoute,
    user
} = require("../middlewares");
const {errorHandler} = require("../utils/helpers");
const {availableRoles: roles} = require("../utils/config");
const {
    avatarValidator,
    carInfosValidator,
    hashedUploadHandler
} = require("../utils/upload");
const fieldsOptions = {
    "avatar": {
        folderPath: "public/uploads/",
        validator: avatarValidator
    },
    "carInfos": {
        folderPath: "public/uploads/",
        validator: carInfosValidator
    }
};
function getUserRouter(userModule) {
    const routerModule = userModule || getUserModule({});
    const router = new express.Router();

    router.get(
        "/infos",
        protectRoute,
        user.ensureUserExists,
        errorHandler(routerModule.getInformations)
    );
    router.get(
        "/drivers",
        protectRoute,
        allowRoles([roles.conflictManager]),
        errorHandler(routerModule.getNearByDrivers)
    );
    router.get(
        "/all",
        protectRoute,
        allowRoles([roles.adminRole]),
        parsePaginationHeaders,
        errorHandler(routerModule.getAllUsers)
    )

    router.post(
        "/delete-avatar",
        protectRoute,
        errorHandler(routerModule.deleteAvatar)
    );
    router.post(
        "/update-profile",
        protectRoute,
        hashedUploadHandler(fieldsOptions).fields([
            {maxCount: 1, name: "avatar"},
            {maxCount: 1, name: "carInfos"}
        ]),
        errorHandler(routerModule.updateProfile)
    );
    router.post(
        "/update-availability",
        protectRoute,
        allowRoles([roles.driverRole]),
        user.ensureCanUpdateAvailability,
        errorHandler(routerModule.updateAvailabilty)
    );
    router.post(
        "/delete-account",
        protectRoute,
        user.ensureUserExists,
        allowRoles(Object.values(roles).filter(
            (value) => value !== roles.adminRole
        )),
        errorHandler(routerModule.deleteAccount)
    );
    return router;
}

module.exports = getUserRouter;