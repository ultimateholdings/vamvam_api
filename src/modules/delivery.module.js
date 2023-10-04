/*jslint
node
*/
const {Delivery, DeliveryConflict, User} = require("../models");
const {errors, eventMessages} = require("../utils/system-messages");
const mailer = require("../utils/email-handler")();
const {
    apiDeliveryStatus,
    conflictStatuses,
    deliveryStatuses,
    availableRoles: roles
} = require("../utils/config");
const {
    formatDbPoint,
    generateCode,
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
                return acc;
            }
            acc[key] = value;
            return acc;
        },
        Object.create(null)
    );
    return result;
}


/*
this function was created just to mimic the delivery
price calculation due to lack of informations
*/
function calculatePrice() {
    return 1000;
}

function getDeliveryModule({associatedModels, model}) {
    const deliveryModel = model || Delivery;
    const associations = associatedModels || {DeliveryConflict, User};
    const deliveryPagination = ressourcePaginator(deliveryModel.getAll);
    const terminatedPagination = ressourcePaginator(
        deliveryModel.getTerminated
    );
    const ongoingState = [
        deliveryStatuses.pendingReception,
        deliveryStatuses.toBeConfirmed,
        deliveryStatuses.started,
        deliveryStatuses.inConflict
    ];

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
        drivers.forEach(function (user) {
            deliveryModel.emitEvent(eventName, {
                payload: deliveryData,
                user
            });
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

    function reduceCredit(driverId, balance) {
        let data;
        if (balance.point < 1) {
            data = {bonus: 1, point: 0};
        } else {
            data = {bonus: 0, point: 1};
        }
        data.driverId = driverId;
        deliveryModel.emitEvent("point-withdrawal-requested", data);
    }

    function formatClientResponse({delivery, id}) {
        let result = delivery.toResponse();
        result.driver = delivery.Driver.toShortResponse();
        if (delivery.Driver.position !== null) {
            result.driver.position = formatDbPoint(delivery.Driver.position);
        }
        result.invited = true;
        if (delivery.clientId === id) {
            result.invited = false;
            result.code = delivery.code;
        } else {
            result.client = delivery.Client.toShortResponse();
        }
        return result;
    }

    function formatDriverResponse({delivery, id}) {
        const result = delivery.toResponse();
        result.client = delivery.Client.toShortResponse();
        if (delivery.driverId === id && delivery.conflictId !== null) {
            return null;
        }
        if (delivery.status === deliveryStatuses.terminated) {
            result.code = delivery.code;
        }
        if (delivery.driverId !== id) {
            result.conflictId = delivery.conflictId ?? undefined;
            result.driver = delivery.Driver.toShortResponse();
        }
        if (delivery.Conflict !== null && delivery.Conflict !== undefined) {
            result.departure = formatDbPoint(delivery.Conflict.lastLocation);
        }
        return result;
    }

    function formatResponse({delivery, id, role}) {
        let result = null;
        if (role === roles.clientRole) {
            result = formatClientResponse({delivery, id});
        }
        if (role === roles.driverRole) {
            result = formatDriverResponse({delivery, id});
        }
        return result;
    }

    function closeDelivery(delivery) {
        const members = delivery.getRecipientsId();
        members.push(delivery.clientId);
        members.forEach(function (userId) {
            deliveryModel.emitEvent(
                "delivery-end",
                {
                    payload: delivery.id,
                    userId
                }
            );
        });
        members.push(delivery.driverId);
        deliveryModel.emitEvent(
            "room-deletion-requested",
            {deliveryId: delivery.id, members}
        );
    }

    async function updateDriverPosition(driverMessage) {
        let {data, driverId} = driverMessage;
        let deliveries;
        let position;
        let updated;
        try {
            if (!isValidLocation(data)) {
                deliveryModel.emitEvent("driver-position-update-failed", {
                    payload: {
                        data: "Invalid Location Datas",
                        message: errors.invalidLocation.message
                    },
                    userId: driverId
                });
            }
            if (Array.isArray(data)) {
                position = data.at(-1);
            } else {
                position = data;
            }
            position = toDbPoint(position);
            [updated] = await associations.User.update(
                {position},
                {where: {id: driverId}}
            );
            deliveries = await deliveryModel.getOngoing(driverId);
            deliveries = deliveries ?? [];
            deliveryModel.emitEvent(
                "driver-position-update-completed",
                {payload: {updated: updated > 0}, userId: driverId}
            );
            deliveries.forEach(function (delivery) {
                const recipients = delivery.getRecipientsId();
                recipients.push(delivery.clientId);
                recipients.forEach(function (userId) {
                    deliveryModel.emitEvent(
                        "driver-position-updated",
                        {
                            payload: {
                                deliveryId: delivery.id,
                                positions: data
                            },
                            userId
                        }
                    );
                });
            });
        } catch (ignore) {
        }
    }

    async function updateDeliveryItinerary(data) {
        let others;
        const {payload, userId} = data;
        const delivery = await deliveryModel.findOne({
            where: {driverId: userId, id: payload.deliveryId}
        });
        if (delivery === null) {
            payload.error = errors.notFound;
            return deliveryModel.emitEvent(
                "itinerary-update-rejected",
                {payload, userId}
            );
        }
        if (
            Array.isArray(payload.points) &&
            payload.points.every(isValidLocation)
        ) {
            delivery.route = toDbLineString(payload.points);
            await delivery.save();
            others = delivery.getRecipientsId();
            others.push(delivery.clientId);
            deliveryModel.emitEvent(
                "itinerary-update-fulfilled",
                {
                    payload: {updated: true},
                    userId
                }
            );
            others.forEach(function (id) {
                deliveryModel.emitEvent("itinerary-updated", {
                    payload,
                    userId: id
                });
            });
        } else {
            payload.error = errors.invalidValues;
            return deliveryModel.emitEvent(
                "itinerary-update-rejected",
                {payload, userId}
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
            const isExternal = allowedExternals.includes(role);
            let isInvited = delivery.getRecipientsId();
            let isInvolved = (delivery.clientId === id) || (
                delivery.driverId === id
            );
            isInvited = (
                isInvited.includes(id) &&
                ongoingState.includes(delivery.status)
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

    async function ensureHasCredit(req, res, next) {
        const {id} = req.user.token;
        let balance = await deliveryModel.getDriverBalance(id);
        if (balance.hasCredit) {
            req.balance = balance;
            next();
        } else {
            sendResponse(res, errors.emptyWallet);
        }
    }

    async function ensureCanReport(req, res, next) {
        let conflict;
        let {conflictType, lastPosition} = req.body;
        const {delivery} = req;
        const {role} = req.user.token;
        const allowedTypes = deliveryModel.getSettings().conflict_types;
        if (!ongoingState.includes(delivery.status)) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        if (!allowedTypes.some((type) => type.code === conflictType)) {
            return sendResponse(
                res,
                errors.unsupportedType,
                {prop: "conflictType"}
            );
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

    async function validateContent(req, res, next) {
        let body;
        let tmp;
        let allowedTypes = Delivery.getSettings().package_types;
        try {
            body = formatBody(propertiesPicker(req.body)(
                deliveryModel?.updatableProps ?? []
            ));
        } catch (error) {
            tmp = {content: error.message};
            return sendResponse(res, errors.invalidLocation, tmp);
        }
        try {
            body.recipientInfos = await getOtherInfos(body.recipientInfos);
        } catch (error) {
            tmp = {content: error.message};
            return sendResponse(res, errors.invalidValues, tmp);
        }
        if (!allowedTypes.some((type) => type.code === body.packageType)) {
            return sendResponse(
                res,
                errors.unsupportedType,
                {prop: "packageType"}
            );
        }
        req.body = body;
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

    function ensureNotExpired(req, res, next) {
        const {delivery} = req;
        let deadline = Date.parse(delivery.createdAt);
        deadline += deliveryModel.getSettings().ttl * 1000;
        if (deadline < Date.now()) {
            return sendResponse(res, errors.deliveryTimeout);
        }
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
        otherUsers = await associations.User.getAllByPhones(otherUsers);
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

    async function acceptDelivery(req, res) {
        let driver;
        let client;
        let others;
        let notification;
        const {id} = req.user.token;
        const {balance, delivery} = req;
        driver = await associations.User.findOne({where: {id}});
        delivery.status = deliveryStatuses.pendingReception;
        await delivery.save();
        await delivery.setDriver(driver);
        res.status(200).send({
            accepted: true
        });
        client = await delivery.getClient();
        others = await associations.User.getAllByPhones(
            delivery.getRecipientPhones()
        );
        notification = {
            payload: {
                deliveryId: delivery.id,
                driver: driver.toShortResponse()
            },
            userId: delivery.clientId
        };
        deliveryModel.emitEvent("delivery-accepted", notification);
        notification = {
            payload: delivery.toResponse()
        };
        notification.payload.driver = driver.toShortResponse();
        notification.payload.client = client.toShortResponse();
        notification.payload.invited = true;
        others.forEach(function (user) {
            notification.userId = user.id;
            deliveryModel.emitEvent("new-invitation", notification);
        });
        reduceCredit(id, balance);
        others.push(client, driver);
        await createChatRoom(delivery, others);
        await driver.setAvailability(false);
    }

    async function archiveConflict(req, res) {
        let client;
        const {conflict} = req;
        const {id} = req.user.token;
        const delivery = await conflict.getDelivery();
        const members = delivery.getRecipientsId();
        const conflictType = deliveryModel.getSettings(
        ).conflict_types.filter((type) => type.code === conflict.type);
        members.push(delivery.clientId);
        conflict.status = conflictStatuses.cancelled;
        conflict.assignerId = id;
        delivery.status = deliveryStatuses.archived;
        await conflict.save();
        await delivery.save();
        res.status(200).send({archived: true});
        members.forEach(function (userId) {
            deliveryModel.emitEvent("delivery-archived", {
                payload: {
                    cause: conflictType[0],
                    id: delivery.id
                },
                userId
            });
        });
        client = await delivery.getClient();
        client = client.toResponse();
        mailer.notifyWithEmail({
            email: client.email,
            notification: eventMessages.withTransfomedBody(
                eventMessages.deliveryArchived,
                (body, lang) => body.replace(
                    "{cause}",
                    conflictType[0][lang] ?? "N/A"
                )
            )[client.lang ?? "en"]
        });
    }

    async function assignDriver(req, res) {
        let payload;
        const {conflict, driver} = req;
        const {id} = req.user.token;
        const delivery = await deliveryModel.getDeliveryDetails(
            conflict.deliveryId
        );
        conflict.assignerId = id;
        conflict.assigneeId = driver.id;
        await conflict.save();
        res.status(200).send({assigned: true});
        payload = formatDriverResponse({delivery, id: driver.id});
        deliveryModel.emitEvent("new-assignment", {
            payload,
            userId: driver.id
        });
        delivery.departure = conflict.lastLocation;
        delivery.deliveryMeta.departureAddress = conflict.lastLocationAdress;
        deliveryModel.emitEvent(
            "room-join-requested",
            {delivery, user: driver}
        );
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
            by: deliveryModel.getSettings().search_radius,
            delivery,
            eventName: "delivery-cancelled"
        });
    }

    async function confirmDeposit(req, res) {
        const {id} = req.user.token;
        const {delivery} = req;
        let others;
        if (delivery.clientId !== id) {
            return sendResponse(res, errors.forbiddenAccess);
        }
        if (delivery.status !== deliveryStatuses.toBeConfirmed) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        others = delivery.getRecipientsId();
        others.push(delivery.clientId, delivery.driverId);
        delivery.status = deliveryStatuses.started;
        delivery.begin = new Date().toISOString();
        await delivery.save();
        res.status(200).send({started: true});
        others.forEach(
            (userId) => deliveryModel.emitEvent("delivery-started", {
                payload: delivery.id,
                userId
            })
        );
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
        results = await deliveryPagination({
            getParams,
            maxPageSize,
            pageToken,
            skip
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
        const {id, role} = req.user.token;
        const {delivery, isExternal, isInvited} = req;
        let response;
        let client;
        let driver;
        client = await delivery.getClient();
        driver = await delivery.getDriver();
        client = client.toShortResponse();
        driver = driver.toShortResponse();
        response = delivery.toResponse();
        response.invited = isInvited;
        if (isExternal || isInvited) {
            response.client = client;
            response.driver = driver;
        }
        if (isExternal || client.id === id) {
            response.code = delivery.code;
        }
        if (role === roles.clientRole) {
            response.driver = driver;
        }
        if (role === roles.driverRole) {
            response.client = client;
        }
        res.status(200).send(response);
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
        let {body} = req;
        let tmp;
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
            by: deliveryModel.getSettings().search_radius,
            delivery: tmp,
            eventName: "new-delivery"
        });
    }

    async function relaunchDelivery(req, res) {
        const {delivery} = req;
        const newDate = new Date();
        await deliveryModel.update({
            createdAt: newDate,
            updatedAt: newDate
        }, {
            where: {id: delivery.id}
        });
        res.status(200).json({relaunched: true});
        await notifyNearbyDrivers({
            by: deliveryModel.getSettings().search_radius,
            delivery,
            eventName: "new-delivery"
        });
    }

    async function reportDelivery(req, res) {
        let others;
        const {id} = req.user.token;
        const {delivery} = req;
        const {
            lastPosition,
            conflictType: type
        } = req.body;
        const conflict = {lastPosition, type};
        conflict.reporter = await associations.User.findOne({where: {id}});
        conflict.reporter = conflict.reporter.toShortResponse();
        delivery.status = deliveryStatuses.inConflict;
        others = await associations.DeliveryConflict.create({
            deliveryId: delivery.id,
            lastLocation: toDbPoint(lastPosition),
            lastLocationAdress: lastPosition.address,
            reporterId: id,
            type
        });
        delivery.conflictId = others.id;
        await delivery.save();
        conflict.id = others.id;
        conflict.delivery = delivery.toResponse();
        res.status(200).send({reported: true});
        others = delivery.getRecipientsId();
        others.push(delivery.clientId);
        others.forEach(
            (userId) => deliveryModel.emitEvent(
                "delivery/new-conflict",
                {
                    payload: delivery.id,
                    userId
                }
            )
        );
        deliveryModel.emitEvent("manager/new-conflict", {payload: conflict});
        await associations.User.update(
            {available: true},
            {where: {id: delivery.driverId}}
        );
    }

    async function signalReception(req, res) {
        const {id} = req.user.token;
        const {delivery} = req;
        let others;
        if (delivery.driverId !== id) {
            return sendResponse(res, errors.forbiddenAccess);
        }
        if (delivery.status !== deliveryStatuses.pendingReception) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        others = delivery.getRecipientsId();
        others.push(delivery.clientId);
        delivery.status = deliveryStatuses.toBeConfirmed;
        await delivery.save();
        res.status(200).send({driverRecieved: true});
        others.forEach(
            (userId) => deliveryModel.emitEvent("delivery-received", {
                payload: delivery.id,
                userId
            })
        );
    }

    async function terminateDelivery(req, res) {
        const {delivery} = req;
        const {id} = req.user.token;
        delivery.status = deliveryStatuses.terminated;
        delivery.end = new Date().toISOString();
        await delivery.save();
        await associations.User.update({available: true}, {where: {id}});
        res.status(200).send({
            terminated: true
        });
        closeDelivery(delivery);
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
        delivery.status = deliveryStatuses.terminated;
        await associations.User.update({available: true}, {where: {id}});
        await delivery.save();
        await conflict.save();
        res.status(200).send({terminated: true});
        deliveryModel?.emitEvent("conflict-solved", {
            assignerId: conflict.assignerId,
            conflictId: conflict.id
        });
        closeDelivery(delivery);
    }

    async function getOngoingDeliveries(req, res) {
        let {id, role} = req.user.token;
        let deliveries = await deliveryModel.withStatuses(id, ongoingState);
        deliveries = deliveries.map(
            (delivery) => formatResponse({delivery, id, role})
        ).filter((delivery) => delivery !== null);
        res.status(200).json({deliveries});
    }

    async function getTerminatedDeliveries(req, res) {
        let response;
        let {id, role} = req.user.token;
        let {maxPageSize, skip} = req.query;
        const pageToken = req.headers["page-token"];
        const getParams = function (params) {
            params.userId = id;
            return params;
        };
        response = await terminatedPagination({
            getParams,
            maxPageSize,
            pageToken,
            skip
        });
        response.results = response.results.map(
            (delivery) => formatResponse({delivery, id, role})
        ).filter((delivery) => delivery !== null);
        res.status(200).json(response);
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
        ensureHasCredit,
        ensureInitial,
        ensureNotExpired,
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
        validateContent,
        verifyConflictingDelivery
    });
}

module.exports = getDeliveryModule;