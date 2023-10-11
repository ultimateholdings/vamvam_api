/*jslint
node
*/

const express = require("express");
const getDeliveryModule = require("../modules/delivery.module");
const {errorHandler, isValidLocation} = require("../utils/helpers");
const {availableRoles: roles} = require("../utils/config");
const {errors} = require("../utils/system-messages");
const {
    allowRoles,
    delivery,
    parsePaginationHeaders,
    protectRoute,
    requiredBodyProps
} = require("../middlewares");

function getDeliveryRouter(module) {
    const deliveryModule = module || getDeliveryModule({});
    const router = new express.Router();
    const conflictRouter = new express.Router();
    const requiredString = (id) => typeof id === "string" && id.length > 0;
    const requiredLocation = (keys) => keys.reduce(function(acc, key) {
        acc[key] = isValidLocation;
        return acc;
    }, Object.create(null));
    
    router.get(
        "/infos",
        protectRoute,
        requiredBodyProps({id: requiredString}),
        delivery.itExists,
        delivery.userCanAccess([roles.adminRole, roles.conflictManager]),
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
        requiredBodyProps(
            requiredLocation(["destination", "departure"]),
            errors.invalidLocation
        ),
        delivery.isValidRequest,
        errorHandler(deliveryModule.requestDelivery)
    );

    router.post(
        "/relaunch",
        protectRoute,
        allowRoles([roles.clientRole]),
        requiredBodyProps({id: requiredString}), 
        delivery.itExists,
        delivery.userCanAccess([], []),
        delivery.isInitial,
        errorHandler(deliveryModule.relaunchDelivery)
    );

    router.post(
        "/verify-code",
        protectRoute,
        allowRoles([roles.driverRole]),
        requiredBodyProps({id: requiredString}),
        delivery.itExists,
        delivery.canTerminate,
        errorHandler(deliveryModule.terminateDelivery)
    );
    router.post(
        "/accept",
        protectRoute,
        allowRoles([roles.driverRole]),
        requiredBodyProps({id: requiredString}),
        delivery.itExists,
        delivery.isInitial,
        delivery.notExpired,
        delivery.hasCredit,
        errorHandler(deliveryModule.acceptDelivery)
        );
    router.post(
        "/cancel",
        protectRoute,
        allowRoles([roles.clientRole]),
        requiredBodyProps({id: requiredString}),
        delivery.itExists,
        errorHandler(deliveryModule.cancelDelivery)
    );
    router.post(
        "/signal-on-site",
        protectRoute,
        allowRoles([roles.driverRole]),
        requiredBodyProps({id: requiredString}),
        delivery.itExists,
        errorHandler(deliveryModule.signalReception)
    );
    router.post(
        "/confirm-deposit",
        protectRoute,
        allowRoles([roles.clientRole]),
        requiredBodyProps({id: requiredString}),
        delivery.itExists,
        errorHandler(deliveryModule.confirmDeposit)
    );
    router.post(
        "/rate",
        protectRoute,
        allowRoles([roles.clientRole]),
        requiredBodyProps({id: requiredString}),
        delivery.itExists,
        delivery.userCanAccess([], []),
        errorHandler(deliveryModule.rateDelivery)
    );
    conflictRouter.get(
        "/all-new",
        protectRoute,
        allowRoles([roles.conflictManager]),
        parsePaginationHeaders,
        errorHandler(deliveryModule.getNewConflicts)
    );
    conflictRouter.get(
        "/",
        protectRoute,
        allowRoles([roles.conflictManager]),
        parsePaginationHeaders,
        errorHandler(deliveryModule.getAssignedConflicts)
    );
    conflictRouter.post(
        "/verify-code",
        protectRoute,
        allowRoles([roles.driverRole]),
        requiredBodyProps({id: requiredString}),
        delivery.itExists,
        delivery.isConflicting,
        errorHandler(deliveryModule.verifyConflictingDelivery)
    )
    conflictRouter.post(
        "/report",
        protectRoute,
        allowRoles([roles.driverRole, roles.adminRole]),
        requiredBodyProps({id: requiredString}),
        delivery.itExists,
        delivery.userCanAccess([roles.adminRole]),
        delivery.canReport,
        errorHandler(deliveryModule.reportDelivery)
    );
    conflictRouter.post(
        "/assign-driver",
        protectRoute,
        allowRoles([roles.conflictManager]),
        requiredBodyProps({
            id: requiredString,
            driverId: requiredString
        }),
        delivery.conflictOpened,
        delivery.driverExists,
        delivery.conflictNotAssigned,
        errorHandler(deliveryModule.assignDriver)
    );
    conflictRouter.post(
        "/archive",
        protectRoute,
        allowRoles([roles.conflictManager]),
        delivery.conflictOpened,
        errorHandler(deliveryModule.archiveConflict)
    );
    router.use("/conflict", conflictRouter);
    
    return router;
}

module.exports = getDeliveryRouter;