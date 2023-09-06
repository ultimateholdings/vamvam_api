/*jslint
node
*/
const crypto = require("crypto");
const {Delivery, DeliveryConflict, User} = require("../models");
const {
    apiDeliveryStatus,
    conflictStatuses,
    deliveryStatuses,
    errors,
    availableRoles: roles
} = require("../utils/config");
const {
    formatDbPoint,
    isValidLocation,
    propertiesPicker,
    ressourcePaginator,
    sendCloudMessage,
    sendResponse,
    toDbLineString,
    toDbPoint
} = require("../utils/helpers");

const dbStatusMap = Object.entries(apiDeliveryStatus).reduce(
    function (acc, [key, value]) {
        acc[value] = key;
        return acc;
    },
    Object.create(null)
);

function formatBody(deliveryRequest) {
    const locationProps = ["departure", "destination"];
    const result = Object.entries(deliveryRequest).reduce(
        function (acc, [key, value]) {
            if (acc.deliveryMeta === undefined) {
                acc.deliveryMeta = {};
            }
            if (locationProps.includes(key)) {
                if (!isValidLocation(value)) {
                    throw new Error(
                        key +
                        " latitude and longitude should be a valid number"
                    );
                }
                acc[key] = toDbPoint(value);
                acc.deliveryMeta[key + "Address"] = value.address;
            } else {
                acc[key] = value;
            }
            return acc;
        },
        Object.create(null)
    );
    return result;
}


async function generateCode(byteSize = 5) {
    const {
        default: encoder
    } = await import("base32-encode");
    return encoder(crypto.randomBytes(byteSize), "Crockford");
}

function calculatePrice() {
    return 1000;
}

function getDeliveryModule({associatedModels, model}) {
    const deliveryModel = model || Delivery;
    const associations = associatedModels || {DeliveryConflict, User};
    const deliveryPagination = ressourcePaginator(deliveryModel.getAll);

    deliveryModel.addEventListener(
        "chat-room-requested",
        async function ({userId}) {
            const user = await associations.User.findOne({
                where: {id: userId}
            });
            const rooms = await user?.getRooms();
            deliveryModel.emitEvent(
                "user-rooms-request-fulfilled",
                {rooms: rooms ?? [], userId}
            );
        }
    );

    async function notifyNearbyDrivers({
        by = 5500,
        delivery,
        eventName,
        params = {available: true, role: "driver"}
    }) {
        let drivers = await associations?.User?.nearTo({
            by,
            params,
            point: delivery.departure
        });
        const deliveryData = delivery.toResponse();
        deliveryData.client = await delivery.getClient();
        deliveryData.client = deliveryData.client.toShortResponse();
        drivers = drivers ?? [];
        deliveryModel.emitEvent(eventName, {
            delivery: deliveryData,
            drivers
        });
    }

    async function createChatRoom(delivery, users) {
        let name = await generateCode(6);
        name = "Delivery " + name;
        deliveryModel.emitEvent(
            "room-creation-requested",
            {delivery, name, users}
        );
    }
    async function updateDriverPosition(driverMessage) {
        let {data, driverId} = driverMessage;
        let clients;
        let position;
        try {
            data = JSON.parse(data.toString());
        } catch (ignore) {
            data = driverMessage.data;
        }
        try {
            if (!isValidLocation(data)) {
                throw new Error("invalid location datas");
            }
            if (Array.isArray(data)) {
                position = data.at(-1);
            } else {
                position = data;
            }
            position = toDbPoint(position);
            await associations.User.update(
                {position},
                {where: {id: driverId}}
            );
            clients = await deliveryModel.getOngoing(driverId);
            clients = clients ?? [];
            deliveryModel.emitEvent("driver-position-update-completed", {
                clients: clients.map(function (delivery) {
                    const result = Object.create(null);
                    result.positions = data;
                    result.id = delivery.clientId;
                    result.deliveryId = delivery.id;
                    return result;
                }),
                driverId
            });
        } catch (error) {
            deliveryModel.emitEvent("driver-position-update-failed", {
                data: error.message,
                driverId,
                message: errors.invalidLocation.message
            });
        }
    }

    async function updateDeliveryItinerary(data) {
        const {deliveryId, driverId, points} = data;
        const delivery = await deliveryModel.findOne({
            where: {driverId, id: deliveryId}
        });
        if (delivery === null) {
            data.error = errors.notFound;
            return deliveryModel.emitEvent(
                "itinerary-update-rejected",
                data
            );
        }
        if (Array.isArray(points) && points.every(isValidLocation)) {
            delivery.route = toDbLineString(points);
            await delivery.save();
            deliveryModel.emitEvent(
                "itinerary-update-fulfilled",
                {
                    clientId: delivery.clientId,
                    deliveryId,
                    driverId,
                    points
                }
            );
        } else {
            data.error = errors.invalidValues;
            return deliveryModel.emitEvent(
                "itinerary-update-rejected",
                data
            );
        }
    }

    async function handleCloudMessageFallback(data) {
        let {message, meta, receiverId} = data;
        const userInfos = await associations?.User?.findOne(
            {where: {id: receiverId}}
        );
        message = message[userInfos?.lang ?? "en"];
        if (userInfos !== null && userInfos.deviceToken !== null) {
            await sendCloudMessage({
                body: message.body,
                meta,
                title: message.title,
                to: userInfos.deviceToken
            });
        }
    }

    deliveryModel.addEventListener(
        "driver-position-update-requested",
        updateDriverPosition
    );
    deliveryModel.addEventListener(
        "delivery-itinerary-update-requested",
        updateDeliveryItinerary
    );
    deliveryModel.addEventListener(
        "cloud-message-fallback-requested",
        handleCloudMessageFallback
    );
    deliveryModel.addEventListener(
        "cloud-message-sending-requested",
        sendCloudMessage
    );

    function canAccessDelivery(allowedExternals = []) {
        return function verifyAccess(req, res, next) {
            const {id, role} = req.user.token;
            const {delivery} = req;
            let isInvolved = (delivery.clientId === id) || (
                delivery.driverId === id
            );
            isInvolved = isInvolved && (id !== null || id !== undefined);
            if (allowedExternals.includes(role) || isInvolved) {
                next();
            } else {
                sendResponse(res, errors.forbiddenAccess);
            }
        };
    }

    async function ensureCanReport(req, res, next) {
        let conflict;
        let {lastPosition} = req.body;
        const {delivery} = req;
        const {role} = req.user.token;
        const allowedStatus = [
            deliveryStatuses.pendingReception,
            deliveryStatuses.toBeConfirmed,
            deliveryStatuses.started
        ];
        if (!allowedStatus.includes(delivery.status)) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        conflict = await associations.DeliveryConflict.findOne({
            where: {deliveryId: delivery.id}
        });
        if (conflict !== null) {
            return sendResponse(res, errors.alreadyReported);
        }
        if (!isValidLocation(lastPosition) && role !== roles.adminRole) {
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

    function ensureCanTerminate(req, res, next) {
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
        req.canTerminate = true;
        next();
    }

    async function ensureConflictOpened(req, res, next) {
        const {id} = req.body;
        const conflict = await associations.DeliveryConflict.findOne({
            where: {id}
        });
        if (conflict === null) {
            return sendResponse(res, errors.conflictNotFound);
        }
        if (conflict.status !== conflictStatuses.opened) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        req.conflict = conflict;
        next();
    }

    async function ensureConflictingDelivery(req, res, next) {
        const {deliveryId} = req.body;
        const conflict = await associations.DeliveryConflict.findOne({
            where: {deliveryId}
        });
        if (conflict === null) {
            return sendResponse(res, errors.deliveryNotConflicted);
        }
        if (conflict.status !== conflictStatuses.opened) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        req.conflict = conflict;
        next();
    }

    async function ensureDeliveryExists(req, res, next) {
        const {id} = req.body;
        let delivery;
        if (typeof id !== "string" || id === "") {
            return sendResponse(res, errors.invalidValues);
        }
        delivery = await deliveryModel?.findOne({where: {id}});

        if (delivery === null) {
            return sendResponse(res, errors.notFound);
        }
        req.delivery = delivery;
        next();
    }

    function ensureInitial(req, res, next) {
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

    async function ensureDriverExists(req, res, next) {
        const {driverId} = req.body;
        let driver;
        if (typeof driverId !== "string" || driverId === "") {
            return sendResponse(res, errors.invalidValues);
        }
        driver = await associations.User.findOne({
            where: {id: driverId}
        });
        if (driver === null) {
            return sendResponse(res, errors.driverNotFound);
        }
        req.driver = driver;
        next();
    }

    async function acceptDelivery(req, res) {
        let driver;
        let client;
        let others;
        const {
            phone,
            id: userId
        } = req.user.token;
        const {delivery} = req;
        driver = await associations.User.findOne({
            where: {id: userId, phone}
        });
        delivery.status = deliveryStatuses.pendingReception;
        await delivery.save();
        await delivery.setDriver(driver);
        res.status(200).send({
            accepted: true
        });
        client = await delivery.getClient();
        deliveryModel?.emitEvent("delivery-accepted", {
            clientId: delivery.clientId,
            deliveryId: delivery.id,
            driver: driver.toResponse()
        });
        others = await associations.User.getAllByPhones(
            delivery.getRecipientPhones()
        );
        await createChatRoom(
            delivery,
            [client, driver, ...others]
        );
        await driver.setAvailability(false);
    }

    async function archiveConflict(req, res) {
        const {conflict} = req;
        const {id} = req.user.token;
        conflict.status = conflictStatuses.cancelled;
        conflict.assignerId = id;
        await conflict.save();
        res.status(200).send({archived: true});
    }

    async function assignDriver(req, res) {
        const {conflict, driver} = req;
        const {id} = req.user.token;
        let assignment = await conflict.getDeliveryDetails();
        conflict.assignerId = id;
        conflict.backupId = driver.id;
        await conflict.save();
        res.status(200).send({assigned: true});
        deliveryModel?.emitEvent("new-assignment", {
            assignment,
            driverId: driver.id
        });
        await driver.setAvailability(false);
    }

    async function cancelDelivery(req, res) {
        const {
            id: userId
        } = req.user.token;
        const {delivery} = req;
        if (delivery.clientId !== userId) {
            return sendResponse(
                res,
                errors.forbiddenAccess,
                {cancelled: false}
            );
        }
        if (delivery.driverId !== null) {
            return sendResponse(res, errors.alreadyAssigned);
        }
        delivery.status = deliveryStatuses.cancelled;
        await delivery.save();
        res.status(200).send({cancelled: true});
        await notifyNearbyDrivers({
            delivery,
            eventName: "delivery-cancelled"
        });
    }

    async function confirmDeposit(req, res) {
        const {id} = req.user.token;
        const {delivery} = req;
        if (delivery.clientId !== id) {
            return sendResponse(res, errors.forbiddenAccess);
        }
        if (delivery.status !== deliveryStatuses.toBeConfirmed) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        delivery.status = deliveryStatuses.started;
        delivery.begin = new Date().toISOString();
        await delivery.save();
        res.status(200).send({started: true});
        deliveryModel?.emitEvent("delivery-started", {
            deliveryId: delivery.id,
            participants: [
                delivery.clientId,
                delivery.driverId
            ]
        });
    }

    async function getAllPaginated(req, res) {
        let results;
        let {
            from,
            maxPageSize,
            skip,
            status,
            to
        } = req.query;
        const pageToken = req.headers["page-token"];
        const getParams = function (params) {
            if (apiDeliveryStatus[status] !== undefined) {
                params.status = apiDeliveryStatus[status];
            }
            params.to = to;
            params.from = from;
            return params;
        };
        maxPageSize = Number.parseInt(maxPageSize, 10);
        if (!Number.isFinite(maxPageSize)) {
            maxPageSize = 10;
        }
        skip = Number.parseInt(skip, 10);
        if (!Number.isFinite(skip)) {
            skip = undefined;
        }
        results = await deliveryPagination({
            getParams,
            maxPageSize,
            skip,
            pageToken
        });
        res.status(200).send(results);
    }

    async function getAnalytics(req, res) {
        const {from, to} = req.query;
        let results = await deliveryModel.getAllStats({from, to});
        const initialResult = Object.keys(apiDeliveryStatus).reduce(
            function (acc, key) {
                acc[key] = 0;
                return acc;
            },
            {total: 0}
        );
        results = results.reduce(function (acc, entry) {
            if (dbStatusMap[entry.status] !== undefined) {
                acc[dbStatusMap[entry.status]] = entry.count;
                acc.total += entry.count;
            }
            return acc;
        }, initialResult);
        res.status(200).json({results});
    }

    async function getInfos(req, res) {
        let {delivery} = req;
        let client;
        let driver;
        const code = delivery.code;
        client = await delivery.getClient();
        driver = await delivery.getDriver();
        delivery = delivery.toResponse();
        delivery.code = code;
        delivery.client = client;
        delivery.driver = driver;
        res.status(200).send(delivery);
    }

/*This function is actually a placeholder for the price
calculation of at delivery */
/*jslint-disable*/
    function getPrice(req, res) {
        res.status(200).send({
            price: calculatePrice()
        });
    }
/*jslint-enable*/

    async function rateDelivery(req, res) {
        const {note} = req.body;
        const {delivery} = req;

        if (delivery.note !== null) {
            return sendResponse(res, errors.alreadyRated);
        }
        if (delivery.status !== deliveryStatuses.terminated) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        delivery.note = note;
        await delivery.save();
        res.status(200).send({rated: true});

    }

    async function requestDelivery(req, res) {
        const {id, phone} = req.user.token;
        let user;
        let body;
        let tmp;
        try {
            body = formatBody(propertiesPicker(req.body)(
                deliveryModel?.updatableProps ?? []
            ));
        } catch (error) {
            tmp = {content: error.message};
            return sendResponse(res, errors.invalidLocation, tmp);
        }
        user = await associations.User.findOne({where: {id, phone}});
        tmp = await generateCode();
        body.price = calculatePrice();
        body.code = tmp;
        tmp = await deliveryModel.create(body);
        await tmp.setClient(user);
        res.status(200).send({
            code: body.code,
            id: tmp.id,
            price: body.price
        });
        await notifyNearbyDrivers({
            delivery: tmp,
            eventName: "new-delivery"
        });
    }

    async function relaunchDelivery(req, res) {
        const {delivery} = req;
        res.status(200).json({relaunched: true});
        await notifyNearbyDrivers({
            delivery,
            eventName: "new-delivery"
        });
    }

    async function reportDelivery(req, res) {
        const {id} = req.user.token;
        const {delivery} = req;
        const {conflictType, lastPosition} = req.body;
        const conflict = {
            lastPosition,
            type: conflictType
        };
        conflict.reporter = await associations.User.findOne({where: {id}});
        conflict.reporter = conflict.reporter.toResponse();

        delivery.status = deliveryStatuses.inConflict;
        await delivery.save();
        await associations.DeliveryConflict.create({
            deliveryId: delivery.id,
            lastLocation: toDbPoint(lastPosition),
            reporterId: id,
            type: conflictType
        });
        conflict.delivery = delivery.toResponse();
        res.status(200).send({reported: true});
        deliveryModel?.emitEvent("new-conflict", {
            clientId: delivery.clientId,
            conflict,
            deliveryId: delivery.id
        });
        await associations.User.update(
            {available: true},
            {where: {id: delivery.driverId}}
        );
    }

    async function signalReception(req, res) {
        const {id} = req.user.token;
        const {delivery} = req;
        if (delivery.driverId !== id) {
            return sendResponse(res, errors.forbiddenAccess);
        }
        if (delivery.status !== deliveryStatuses.pendingReception) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        delivery.status = deliveryStatuses.toBeConfirmed;
        await delivery.save();
        res.status(200).send({driverRecieved: true});
        deliveryModel?.emitEvent("delivery-recieved", {
            clientId: delivery.clientId,
            deliveryId: delivery.id
        });
    }

    async function terminateDelivery(req, res) {
        const {canTerminate, delivery} = req;
        const {id} = req.user.token;
        if (canTerminate === true) {
            delivery.status = deliveryStatuses.terminated;
            delivery.end = new Date().toISOString();
            await delivery.save();
            res.status(200).send({
                terminated: true
            });
            deliveryModel?.emitEvent(
                "delivery-end",
                {clientId: delivery.clientId, deliveryId: delivery.id}
            );
            await associations.User.update({available: true}, {where: {id}});
        } else {
            return sendResponse(
                res,
                errors.cannotPerformAction,
                {canTerminate}
            );
        }
    }

    async function verifyConflictingDelivery(req, res) {
        const {conflict} = req;
        const {id} = req.user.token;
        const {code} = req.body;
        const delivery = await conflict.getDelivery();

        if (conflict.assigneeId !== id) {
            return sendResponse(res, errors.forbiddenAccess);
        }
        if (delivery.code !== code) {
            return sendResponse(res, errors.invalidCode);
        }
        conflict.status = conflictStatuses.closed;
        await conflict.save();
        res.status(200).send({terminated: true});
        deliveryModel?.emitEvent("conflict-solved", {
            assignerId: conflict.assignerId,
            conflictId: conflict.id
        });
        await associations.User.update({available: true}, {where: {id}});
    }

    async function getOngoingDeliveries(req, res) {
        let {id, role} = req.user.token;
        let deliveries = await deliveryModel.getAllWithStatus(
            id,
            [
                deliveryStatuses.started,
                deliveryStatuses.pendingReception,
                deliveryStatuses.toBeConfirmed
            ]
        );
        deliveries = deliveries.map(
            (delivery) => toDeliveryResponse(delivery, role)
        );
        res.status(200).json({deliveries});
    }

    async function getTerminatedDeliveries(req, res) {
        let {id, role} = req.user.token;
        let deliveries = await deliveryModel.getAllWithStatus(
            id,
            deliveryStatuses.terminated
        );
        deliveries = deliveries.map(
            (delivery) => toDeliveryResponse(delivery, role)
        );
        res.status(200).json({deliveries});
    }

    function toDeliveryResponse(delivery, role) {
        const result = delivery.toResponse();
        let driverData;
        if (role === roles.clientRole) {
            driverData = delivery.Driver.toShortResponse();
            if(delivery.Driver.position !== null) {
                driverData.position = formatDbPoint(delivery.Driver.position);
            }
            result.driver = driverData;
            result.code = delivery.code;
        } else {
            result.client = delivery.Client.toShortResponse();
            if (delivery.status === deliveryStatuses.terminated) {
                result.code = delivery.code;
            }
        }
        return result;
    }

    return Object.freeze({
        acceptDelivery,
        archiveConflict,
        assignDriver,
        canAccessDelivery,
        cancelDelivery,
        confirmDeposit,
        ensureCanReport,
        ensureCanTerminate,
        ensureConflictOpened,
        ensureConflictingDelivery,
        ensureDeliveryExists,
        ensureDriverExists,
        ensureInitial,
        getAnalytics,
        getAllPaginated,
        getAnalytics,
        getInfos,
        getOngoingDeliveries,
        getTerminatedDeliveries,
/*jslint-disable*/
        getPrice,
/*jslint-enable*/
        rateDelivery,
        relaunchDelivery,
        reportDelivery,
        requestDelivery,
        signalReception,
        terminateDelivery,
        verifyConflictingDelivery
    });
}

module.exports = getDeliveryModule;