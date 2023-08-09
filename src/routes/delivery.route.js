/*jslint
node
*/

const express = require("express");
const getDeliveryModule = require("../modules/delivery.module");
const {errorHandler} = require("../utils/helpers");
const {availableRoles: roles} = require("../utils/config");
const {
    allowRoles,
    protectRoute
} = require("../utils/middlewares");

function getDeliveryRouter(module) {
    const deliveryModule = module || getDeliveryModule({});
    const router = new express.Router();
    const conflictRouter = new express.Router();

    router.post(
        "/request",
        protectRoute,
        errorHandler(deliveryModule.requestDelivery)
    );

    router.get(
        "/infos",
        protectRoute,
        deliveryModule.ensureDeliveryExists,
        deliveryModule.canAccessDelivery,
        errorHandler(deliveryModule.getInfos)
    );
    router.get(
        "/price",
        protectRoute,
        errorHandler(deliveryModule.getPrice)
    );
    router.post(
        "/verify-code",
        protectRoute,
        deliveryModule.ensureDeliveryExists,
        deliveryModule.ensureCanTerminate,
        errorHandler(deliveryModule.terminateDelivery)
    );
    router.post(
        "/accept",
        protectRoute,
        allowRoles([roles.driverRole]),
        deliveryModule.ensureDeliveryExists,
        errorHandler(deliveryModule.acceptDelivery)
    );
    router.post(
        "/cancel",
        protectRoute,
        allowRoles([roles.clientRole]),
        deliveryModule.ensureDeliveryExists,
        errorHandler(deliveryModule.cancelDelivery)
    );
    router.post(
        "/signal-reception",
        protectRoute,
        allowRoles([roles.driverRole]),
        deliveryModule.ensureDeliveryExists,
        errorHandler(deliveryModule.signalReception)
    );
    router.post(
        "/confirm-deposit",
        protectRoute,
        allowRoles([roles.clientRole]),
        deliveryModule.ensureDeliveryExists,
        errorHandler(deliveryModule.confirmDeposit)
    );
    router.post(
        "/rate",
        protectRoute,
        allowRoles([roles.clientRole]),
        deliveryModule.ensureDeliveryExists,
        deliveryModule.canAccessDelivery,
        errorHandler(deliveryModule.rateDelivery)
    );
    conflictRouter.post(
        "/verify-code",
        protectRoute,
        allowRoles([roles.driverRole]),
        deliveryModule.ensureConflictingDelivery,
        errorHandler(deliveryModule.verifyConflictingDelivery)
    )
    conflictRouter.post(
        "/report",
        protectRoute,
        allowRoles([roles.driverRole]),
        deliveryModule.ensureDeliveryExists,
        deliveryModule.canAccessDelivery,
        deliveryModule.ensureCanReport,
        errorHandler(deliveryModule.reportDelivery)
    );
    conflictRouter.post(
        "/assign-driver",
        protectRoute,
        allowRoles([roles.conflictManager]),
        deliveryModule.ensureConflictOpened,
        deliveryModule.ensureDriverExists,
        errorHandler(deliveryModule.assignDriver)
    );
    conflictRouter.post(
        "/archive",
        protectRoute,
        allowRoles([roles.conflictManager]),
        deliveryModule.ensureConflictOpened,
        errorHandler(deliveryModule.archiveConflict)
    );
    router.use("/conflict", conflictRouter);
    
    return router;
}

module.exports = getDeliveryRouter;