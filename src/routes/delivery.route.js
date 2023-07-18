/*jslint
node
*/

const express = require("express");
const getDeliveryModule = require("../modules/delivery.module");
const {errorHandler} = require("../utils/helpers");
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
        allowRoles(["driver"]),
        errorHandler(deliveryModule.terminateDelivery)
    );
    return router;
}

module.exports = getDeliveryRouter;