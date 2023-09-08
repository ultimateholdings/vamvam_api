/*jslint
node
*/

const express = require("express");
const getAdminModule = require("../modules/admin.module");
const {errorHandler} = require("../utils/helpers");
const {availableRoles: roles, availableRoles} = require("../utils/config");
const {
    allowRoles,
    protectRoute
} = require("../utils/middlewares");

function getAdminRouter(module) {
    const adminModule = module || getAdminModule({});
    const router = new express.Router();

    router.get(
        "/system/settings",
        protectRoute,
        errorHandler(adminModule.getSettings)
    );
    router.post(
        "/admin/revoke-all",
        protectRoute,
        allowRoles([availableRoles.adminRole]),
        adminModule.ensureUserExists,
        errorHandler(adminModule.invalidateEveryOne)
    );
    router.post(
        "/admin/revoke-user",
        protectRoute,
        allowRoles([availableRoles.adminRole]),
        adminModule.ensureUserExists,
        errorHandler(adminModule.invalidateUser)
    );
    router.post(
        "/admin/new-admin",
        protectRoute,
        allowRoles([availableRoles.adminRole]),
        adminModule.validateAdminCreation,
        errorHandler(adminModule.createNewAdmin)
    );
    router.post(
        "/admin/update-settings",
        protectRoute,
        allowRoles([availableRoles.adminRole]),
        adminModule.ensureValidSetting,
        errorHandler(adminModule.updateSettings)
    );
    return router;
}

module.exports = Object.freeze(getAdminRouter);