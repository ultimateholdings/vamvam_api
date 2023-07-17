
const express = require("express");
const getDeliveryModule = require("../modules/delivery.module");
const {errorHandler} = require("../utils/helpers");
const {protectRoute} = require("../utils/middlewares");

function getDeliveryRouter (module) {
    const deliveryModule = module || getDeliveryModule({});
    const router = new express.Router();
    
    router.post(
        "/request",
        protectRoute,
        errorHandler(deliveryModule.requestDelivery)
    );
    return router;
}

module.exports = getDeliveryRouter;