/*jslint
node
*/

const express = require("express");
const getDeliveryModule = require("../modules/delivery.module");
const {errorHandler} = require("../utils/helpers");
const {availableRoles: roles} = require("../utils/config");
const {
    allowRoles,
    parsePaginationHeaders,
    protectRoute
} = require("../utils/middlewares");

function getDeliveryRouter(module) {
    const deliveryModule = module || getDeliveryModule({});
    const router = new express.Router();
    const conflictRouter = new express.Router();
    
    router.get(
        "/infos",
        protectRoute,
        deliveryModule.ensureDeliveryExists,
        deliveryModule.canAccessDelivery([roles.adminRole, roles.conflictManager]),
        errorHandler(deliveryModule.getInfos)
    );
    router.get(
        "/price",
        protectRoute,
        errorHandler(deliveryModule.getPrice)
    );
    router.get(
        "/started",
        protectRoute,
        allowRoles([roles.clientRole, roles.driverRole]),
        errorHandler(deliveryModule.getOngoingDeliveries)
    );
    router.get(
        "/terminated",
        protectRoute,
        allowRoles([roles.clientRole, roles.driverRole]),
        parsePaginationHeaders,
        errorHandler(deliveryModule.getTerminatedDeliveries)
        );
    router.get(
        "/all",
        protectRoute,
        allowRoles([roles.adminRole]),
        parsePaginationHeaders,
        errorHandler(deliveryModule.getAllPaginated)
        );
    router.get(
        "/analytics",
        protectRoute,
        allowRoles([roles.adminRole]),
        errorHandler(deliveryModule.getAnalytics)
    );

    router.post(
        "/request",
        protectRoute,
        deliveryModule.validateContent,
        errorHandler(deliveryModule.requestDelivery)
    );

    router.post(
        "/relaunch",
        protectRoute,
        allowRoles([roles.clientRole]),
        deliveryModule.ensureDeliveryExists,
        deliveryModule.canAccessDelivery([]),
        deliveryModule.ensureInitial,
        errorHandler(deliveryModule.relaunchDelivery)
    );

    router.post(
        "/verify-code",
        protectRoute,
        allowRoles([roles.driverRole]),
        deliveryModule.ensureDeliveryExists,
        deliveryModule.ensureCanTerminate,
        errorHandler(deliveryModule.terminateDelivery)
    );
    router.post(
        "/accept",
        protectRoute,
        allowRoles([roles.driverRole]),
        deliveryModule.ensureDeliveryExists,
        deliveryModule.ensureInitial,
        deliveryModule.ensureNotExpired,
        deliveryModule.ensureHasCredit,
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
        "/signal-on-site",
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
        deliveryModule.canAccessDelivery(),
        errorHandler(deliveryModule.rateDelivery)
    );
    conflictRouter.get(
        "/all-new",
        protectRoute,
        allowRoles([roles.conflictManager]),
        parsePaginationHeaders,
        errorHandler(deliveryModule.getNewConflicts)
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
        allowRoles([roles.driverRole, roles.adminRole]),
        deliveryModule.ensureDeliveryExists,
        deliveryModule.canAccessDelivery([roles.adminRole]),
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