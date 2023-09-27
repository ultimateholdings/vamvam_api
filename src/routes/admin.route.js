/*jslint
node
*/

const express = require("express");
const getAdminModule = require("../modules/admin.module");
const {errorHandler} = require("../utils/helpers");
const {availableRoles: roles} = require("../utils/config");
const {
    allowRoles,
    parsePaginationHeaders,
    protectRoute
} = require("../utils/middlewares");

function getAdminRouter(module) {
    const adminModule = module || getAdminModule({});
    const router = new express.Router();

    router.get(
        "/sponsor/ranking",
        protectRoute,
        allowRoles([roles.adminRole]),
        parsePaginationHeaders,
        errorHandler(adminModule.getSponsorRanking)
    );
    router.get(
        "/sponsor/enrolled",
        protectRoute,
        allowRoles([roles.adminRole]),
        parsePaginationHeaders,
        errorHandler(adminModule.getMentoredUsers)
    );
    router.get(
        "/system/settings",
        protectRoute,
        errorHandler(adminModule.getSettings)
    );
    router.post(
        "/user/logout",
        protectRoute,
        errorHandler(adminModule.logoutUser)
    );
    router.post(
        "/sponsor/create",
        protectRoute,
        allowRoles([roles.adminRole]),
        adminModule.validateSponsorCreation,
        errorHandler(adminModule.createSponsor)
    );
    router.post(
        "/admin/revoke-all",
        protectRoute,
        allowRoles([roles.adminRole]),
        adminModule.ensureUserExists,
        errorHandler(adminModule.invalidateEveryOne)
    );
    router.post(
        "/admin/block-user",
        protectRoute,
        allowRoles([roles.adminRole]),
        adminModule.ensureUserExists,
        errorHandler(adminModule.invalidateUser)
    );
    router.post(
        "/admin/activate-user",
        protectRoute,
        allowRoles([roles.adminRole]),
        adminModule.ensureUserExists,
        errorHandler(adminModule.activateUser)
    );
    router.post(
        "/admin/new-admin",
        protectRoute,
        allowRoles([roles.adminRole]),
        adminModule.validateAdminCreation,
        errorHandler(adminModule.createNewAdmin)
    );
    router.post(
        "/admin/update-settings",
        protectRoute,
        allowRoles([roles.adminRole]),
        adminModule.ensureValidSetting,
        errorHandler(adminModule.updateSettings)
    );
    return router;
}

module.exports = Object.freeze(getAdminRouter);