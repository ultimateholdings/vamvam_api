/*jslint
node
*/
const crypto = require("crypto");
const {Delivery, DeliveryConflict, User} = require("../models");
const {
    conflictStatuses,
    deliveryStatuses,
    errors,
    availableRoles: roles
} = require("../utils/config");
const {
    isValidLocation,
    propertiesPicker,
    ressourcePaginator,
    sendCloudMessage,
    sendResponse,
    toDbPoint
} = require("../utils/helpers");


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

function deliveryFetcher({deliveryModel, id, role}) {
    const roleMap = {
        "client": {clientId: id},
        "driver": {driverId: id}
    };
    return async function getDelivery({maxSize, offset}) {
        const finder = roleMap[role ?? "client"];
        let calculatedOffset = offset * maxSize;
        let first;
        let deliveries;

        if (calculatedOffset < 0 || !Number.isFinite(calculatedOffset)) {
            return {
                values: []
            };
        }
        if (calculatedOffset > 0) {
            calculatedOffset -= 1;
        }
        [first, ...deliveries] = await deliveryModel.findAll({
            limit: maxSize,
            offset: calculatedOffset,
            where: finder
        });
        if (offset === 0) {
            return {
                lastId: deliveries.at(-1).id,
                values: [first, ...deliveries]
            };
        }
        return {
            formerLastId: first.id,
            lastId: deliveries.at(-1).id,
            values: deliveries
        };
    };
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

    async function notifyNearbyDrivers(delivery, eventName) {
        let drivers = await associations?.User?.nearTo({
            by: 5500,
            params: {available: true, role: "driver"},
            point: delivery.departure
        });
        drivers = drivers ?? [];
        deliveryModel.emitEvent(eventName, {
            delivery: delivery.toResponse(),
            drivers
        });
    }

    async function createChatRoom(delivery, users) {
        let name = await generateCode(6);
        name = "Delivery " + name
        deliveryModel.emitEvent("room-creation-requested", {delivery, name, users});
    }
    async function updateDriverPosition(driverMessage) {
        const {data, driverId} = driverMessage;
        let clients;
        let position;
        if (isValidLocation(data)) {
            if (Array.isArray(data)) {
                position = data.at(-1);
            } else {
                position = data;
            }
            position = {
                coordinates: [position.latitude, position.longitude],
                type: "Point"
            };
            await associations?.User.update(
                {position},
                {where: {id: driverId}}
            );
            clients = await deliveryModel?.findAll({where: {
                driverId,
                status: "started"
            }});
            clients = clients ?? [];
            deliveryModel.emitEvent("driver-position-update-completed", {
                clients: clients.map((delivery) => delivery.clientId),
                data,
                driverId
            });
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
        "cloud-message-fallback-requested",
        handleCloudMessageFallback
    );
    deliveryModel.addEventListener(
        "cloud-message-sending-requested",
        sendCloudMessage
    );


    function canAccessDelivery(req, res, next) {
        const {id, role} = req.user.token;
        const {delivery} = req;
        const isAdmin = role === roles.admin;
        let isInvolved = (delivery.clientId === id) || (
            delivery.driverId === id
        );
        isInvolved = isInvolved && (id !== null || id !== undefined);
        if (isAdmin || isInvolved) {
            next();
        } else {
            sendResponse(res, errors.forbiddenAccess);
        }
    }

    async function ensureCanReport(req, res, next) {
        let conflict;
        const {delivery} = req;
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
        const delivery = await deliveryModel?.findOne({where: {id}});

        if (delivery === null) {
            return sendResponse(res, errors.notFound);
        }
        req.delivery = delivery;
        next();
    }

    async function ensureDriverExists(req, res, next) {
        const {driverId} = req.body;
        let driver = await associations.User.findOne({
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
        if (delivery.driverId !== null) {
            return sendResponse(res, errors.alreadyAssigned);
        }
        if (delivery.status === deliveryStatuses.cancelled) {
            return sendResponse(res, errors.alreadyCancelled);
        }
        if (delivery.status !== deliveryStatuses.initial) {
            return sendResponse(res, errors.cannotPerformAction);
        }
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
        const {id} = req.body;
        let assignment = await conflict.getDeliveryDetails();
        conflict.assignerId = id;
        conflict.backupId = driver.id;
        await conflict.save();
        res.status(200).send({assigned: true});
        deliveryModel?.emitEvent("new-assignment", {
            assignment,
            driverId: driver.id
        });
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
        await notifyNearbyDrivers(delivery, "delivery-cancelled");
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
        const {id, role} = req.user.token;
        const {maxPageSize, pageToken} = req.body;
        const paginator = ressourcePaginator(
            deliveryFetcher({deliveryModel, id, role})
        );
        results = await paginator(pageToken, maxPageSize);
        res.status(200).send(results);
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
        await notifyNearbyDrivers(tmp, "new-delivery");
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

        if (!isValidLocation(lastPosition)) {
            return sendResponse(res, errors.invalidLocation);
        }
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
        if (canTerminate === true) {
            delivery.status = deliveryStatuses.terminated;
            delivery.end = new Date().toISOString();
            await delivery.save();
            deliveryModel?.emitEvent(
                "delivery-end",
                {clientId: delivery.clientId, deliveryId: delivery.id}
            );
            res.status(200).send({
                terminated: true
            });
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
        getAllPaginated,
        getInfos,
/*jslint-disable*/
        getPrice,
/*jslint-enable*/
        rateDelivery,
        reportDelivery,
        requestDelivery,
        signalReception,
        terminateDelivery,
        verifyConflictingDelivery
    });
}

module.exports = getDeliveryModule;