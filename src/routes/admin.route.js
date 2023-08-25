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

    router.post(
        "/revoke-all",
        protectRoute,
        allowRoles([availableRoles.adminRole]),
        adminModule.ensureUserExists,
        errorHandler(adminModule.invalidateEveryOne)
    );
    router.post(
        "/revoke-user",
        protectRoute,
        allowRoles([availableRoles.adminRole]),
        adminModule.ensureUserExists,
        errorHandler(adminModule.invalidateUser)
    );
    return router;
}

module.exports = Object.freeze(getAdminRouter);