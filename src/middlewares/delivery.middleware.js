/*jslint node*/
const {
    availableRoles,
    conflictStatuses,
    deliveryStatuses
} = require("../utils/config");
const {
    formatDbPoint,
    isValidLocation,
    propertiesPicker,
    sendResponse,
    toDbPoint
} = require("../utils/helpers");
const {errors} = require("../utils/system-messages");

function getDeliveryMiddlewares(model) {
    const locationProps = ["departure", "destination"];
    function formatContent(deliveryRequest) {
        const result = {};
        const meta = {};
        Object.assign(result, deliveryRequest);
        locationProps.forEach(function (key) {
            meta[key + "Address"] = deliveryRequest[key]?.address;
            result[key] = toDbPoint(deliveryRequest[key]);
        });
        result.deliveryMeta = meta;
        return result;
    }
    async function getOtherInfos(request) {
        let main = {};
        let others = [];
        let otherUsers = [];
        if (
            typeof request?.phone === "string" &&
            typeof request?.name === "string"
        ) {
            main = {
                name: request.name,
                phone: request.phone
            };
            otherUsers.push(request.phone);
        }
        if (Array.isArray(request?.otherPhones) && request.otherPhones.every(
            (phone) => typeof phone === "string"
        )) {
            request.otherPhones.forEach(function (phone) {
                otherUsers.push(phone);
                others.push({phone});
            });
        }
        otherUsers = await model.getUsersWithPhone(otherUsers);
        otherUsers.forEach(function (user) {
            let tmp;
            if (user.phone === main.phone) {
                tmp = user.toShortResponse();
                tmp.firstName = main.name;
                main = tmp;
            } else {
                tmp = others.findIndex(
                    (other) => other.phone === user.phone
                );
                others[tmp] = user.toShortResponse();
            }
        });
        if (
            Object.keys(main).length === 0 &&
            Object.keys(others).length === 0
        ) {
            throw new Error("Invalid values sent " + JSON.stringify(request));
        }
        return {main, others};
    }
    async function driverExists(req, res, next) {
        const {driverId} = req.body;
        let driver;
        driver = await model.getDriverById(driverId);
        if (driver === null) {
            return sendResponse(res, errors.driverNotFound);
        }
        req.driver = driver;
        next();
    }
    function isInitial(req, res, next) {
        const {delivery} = req;
        if (delivery.driverId !== null) {
            return sendResponse(res, errors.alreadyAssigned);
        }
        if (delivery.status === deliveryStatuses.cancelled) {
            return sendResponse(res, errors.alreadyCancelled);
        }
        if (delivery.status !== deliveryStatuses.initial) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        next();
    }
    function notExpired(req, res, next) {
        const {delivery} = req;
        let deadline = Date.parse(delivery.createdAt);
        deadline += model.getSettings().ttl * 1000;
        if (deadline < Date.now()) {
            return sendResponse(res, errors.deliveryTimeout);
        }
        next();
    }
    async function itExists(req, res, next) {
        const {id} = req.body;
        let delivery;
        delivery = await model.getById(id);

        if (delivery === null) {
            return sendResponse(res, errors.notFound);
        }
        req.delivery = delivery;
        next();
    }
    function canTerminate(req, res, next) {
        const {started} = deliveryStatuses;
        const {id} = req.user.token;
        const {delivery} = req;
        const {code} = req.body;

        if (delivery.driverId !== id) {
            return sendResponse(res, errors.forbiddenAccess);
        }
        if (delivery.status !== started) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        if (delivery.code !== code) {
            return sendResponse(res, errors.invalidCode);
        }
        next();
    }
    async function conflictOpened(req, res, next) {
        const {id} = req.body;
        const conflict = await model.getConflict({id});
        if (conflict === null) {
            return sendResponse(res, errors.conflictNotFound);
        }
        if (conflict.status !== conflictStatuses.opened) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        req.conflict = conflict;
        next();
    }
    function conflictNotAssigned(req, res, next) {
        const {conflict} = req;
        if (conflict.assigneeId !== null) {
            return sendResponse(res, errors.conflictAssigned);
        }
        if (conflict.assignerId !== null) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        next();
    }
    async function isConflicting(req, res, next) {
        const {id} = req.body;
        const conflict = await model.getConflict({deliveryId: id});
        if (conflict === null) {
            return sendResponse(res, errors.deliveryNotConflicted);
        }
        if (conflict.status !== conflictStatuses.opened) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        req.conflict = conflict;
        next();
    }

    function userCanAccess(
        allowedExternals = [],
        allowedStates = model.ongoingStates
    ) {
        return function verifyAccess(req, res, next) {
            const {id, role} = req.user.token;
            const {delivery} = req;
            const isExternal = allowedExternals.includes(role);
            let isInvited = delivery.getRecipientsId();
            let isInvolved = (delivery.clientId === id) || (
                delivery.driverId === id
            );
            isInvited = (
                isInvited.includes(id) &&
                allowedStates.includes(delivery.status)
            );
            isInvolved = isInvolved && (typeof id === "string");
            if (isExternal || isInvolved || isInvited) {
                req.isExternal = isExternal;
                req.isInvolved = isInvolved;
                req.isInvited = isInvited;
                next();
            } else {
                sendResponse(res, errors.forbiddenAccess);
            }
        };
    }

    async function hasCredit(req, res, next) {
        const {id} = req.user.token;
        let balance = await model.getDriverBalance(id);
        if (balance.hasCredit) {
            req.balance = balance;
            next();
        } else {
            sendResponse(res, errors.emptyWallet);
        }
    }

    async function canReport(req, res, next) {
        let conflict;
        let {conflictType, lastPosition} = req.body;
        const {delivery} = req;
        const {role} = req.user.token;
        const allowedTypes = model.getSettings().conflict_types;
        if (!model.ongoingStates.includes(delivery.status)) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        if (!allowedTypes.some((type) => type.code === conflictType)) {
            return sendResponse(
                res,
                errors.unsupportedType,
                {prop: "conflictType"}
            );
        }
        conflict = await model.getConflict({deliveryId: delivery.id});
        if (conflict !== null) {
            return sendResponse(res, errors.alreadyReported);
        }
        if (
            !isValidLocation(lastPosition) &&
            role !== availableRoles.adminRole
        ) {
            return sendResponse(res, errors.invalidLocation);
        }
        if (!isValidLocation(lastPosition)) {
            conflict = await delivery.getDriver();
            if (conflict.position === null) {
                return sendResponse(res, errors.invalidLocation);
            }
            req.body.lastPosition = formatDbPoint(conflict.position);
        }
        next();
    }

    async function isValidRequest(req, res, next) {
        let tmp;
        let allowedPackages = model.getSettings().package_types;
        let body = formatContent(
            propertiesPicker(req.body)(model.updatableProps ?? [])
        );
        try {
            body.recipientInfos = await getOtherInfos(body.recipientInfos);
        } catch (error) {
            tmp = {content: error.message};
            return sendResponse(res, errors.invalidValues, tmp);
        }
        if (!allowedPackages.some((type) => type.code === body.packageType)) {
            return sendResponse(
                res,
                errors.unsupportedType,
                {prop: "packageType"}
            );
        }
        req.body = body;
        next();
    }
    return Object.freeze({
        canReport,
        canTerminate,
        conflictNotAssigned,
        conflictOpened,
        driverExists,
        hasCredit,
        isConflicting,
        isInitial,
        isValidRequest,
        itExists,
        notExpired,
        userCanAccess
    });
}

module.exports = getDeliveryMiddlewares;