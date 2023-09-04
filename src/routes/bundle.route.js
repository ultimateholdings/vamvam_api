/*jslint
node
*/
const express = require("express");
const getBundleModule = require("../modules/bundle.module");
const {errorHandler} = require("../utils/helpers");
const {availableRoles: roles} = require("../utils/config");
const {
    allowRoles,
    protectRoute
} = require("../utils/middlewares");
function getBundleRouter(module) {
    const bundleModule = module || getBundleModule({});
    const router = new express.Router();
    router.post(
        "/new-bundle",
        protectRoute,
        allowRoles([roles.adminRole]),
        errorHandler(bundleModule.createBundle)
    );
    router.get(
        "/infos",
        protectRoute,
        errorHandler(bundleModule.getBundleInfos)
    );
    router.get(
        "/",
        protectRoute,
        errorHandler(bundleModule.getAllBundle)
        );
    router.post(
        "/update",
        protectRoute,
        allowRoles([roles.adminRole]),
        errorHandler(bundleModule.updateBunch)
    )
    router.post(
        "/delete",
        protectRoute,
        allowRoles([roles.adminRole]),
        errorHandler(bundleModule.deleteBunch)
    )
    return router;
}
module.exports = getBundleRouter;