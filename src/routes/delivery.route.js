/*jslint
node
*/

const express = require("express");
const getDeliveryModule = require("../modules/delivery.module");
const {errorHandler} = require("../utils/helpers");
const {availableRoles: roles} = require("../utils/config");
const {
    allowRoles,
    protectRoute,
    verifyValidId
} = require("../utils/middlewares");

function getDeliveryRouter(module) {
    const deliveryModule = module || getDeliveryModule({});
    const router = new express.Router();

    router.post(
        "/request",
        protectRoute,
        errorHandler(deliveryModule.requestDelivery)
    );

    router.get(
        "/infos",
        protectRoute,
        verifyValidId,
        errorHandler(deliveryModule.getInfos)
    );
    router.post(
        "/verify-code",
        protectRoute,
        verifyValidId,
        allowRoles([roles.driver]),
        errorHandler(deliveryModule.terminateDelivery)
    );
    router.post(
        "/accept",
        protectRoute,
        verifyValidId,
        allowRoles([roles.driver]),
        errorHandler(deliveryModule.acceptDelivery)
    );
    router.post(
        "/cancel",
        protectRoute,
        verifyValidId,
        allowRoles([roles.client]),
        errorHandler(deliveryModule.cancelDelivery)
    );
    return router;
}

module.exports = getDeliveryRouter;