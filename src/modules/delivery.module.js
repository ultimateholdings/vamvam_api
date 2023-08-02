/*jslint
node
*/
const crypto = require("crypto");
const {Delivery, User} = require("../models");
const {
    errors,
    availableRoles: roles
} = require("../utils/config");
const {
    isValidLocation,
    propertiesPicker,
    ressourcePaginator,
    sendResponse
} = require("../utils/helpers");


function formatBody(deliveryRequest) {
    const locationProps = ["departure", "destination"];
    const result = Object.entries(deliveryRequest).reduce(
        function (acc, [key, value]) {
            if (acc.deliveryMeta === undefined) {
                acc.deliveryMeta = {};
            }
            if (locationProps.includes(key)) {
                acc[key] = {
                    coordinates: [value?.latitude, value?.longitude],
                    type: "Point"
                };
                if (!isValidLocation(value)) {
                    throw new Error(
                        key +
                        " latitude and longitude should be a valid number"
                    );
                }
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
    const associations = associatedModels || {User};

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
            sendResponse(res, errors.notAuthorized);
        }
    }

    function ensureCanTerminate(req, res, next) {
        const {started} = deliveryModel?.statuses || {};
        const {id} = req.user.token;
        const {delivery} = req;
        const {code} = req.body;

        if (delivery.driverId !== id) {
            return sendResponse(res, errors.notAuthorized);
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

    async function acceptDelivery(req, res) {
        let driver;
        const {
            phone,
            id: userId
        } = req.user.token;
        const {delivery} = req;
        if (delivery.driverId !== null) {
            return sendResponse(res, errors.alreadyAssigned);
        }
        if (delivery.status === deliveryModel.statuses.cancelled) {
            return sendResponse(res, errors.alreadyCancelled);
        }
        if (delivery.status !== deliveryModel.statuses.initial) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        driver = await associations.User.findOne({
            where: {id: userId, phone}
        });
        delivery.status = deliveryModel.statuses.pendingReception;
        await delivery.save();
        await delivery.setDriver(driver);
        res.status(200).send({
            accepted: true
        });
        deliveryModel?.emitEvent("delivery-accepted", {
            clientId: delivery.clientId,
            deliveryId: delivery.id,
            driver: driver.toResponse()
        });
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

    async function notifyNearbyDrivers(delivery, eventName) {
        let drivers = await associations?.User?.nearTo(
            delivery.departure,
            5500,
            "driver"
        );
        drivers = drivers ?? [];
        deliveryModel?.emitEvent(eventName, {
            delivery: delivery.toResponse(),
            drivers
        });
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

    async function cancelDelivery(req, res) {
        const {
            id: userId
        } = req.user.token;
        const {delivery} = req;
        if (delivery.clientId !== userId) {
            return sendResponse(res, errors.notAuthorized, {cancelled: false});
        }
        if (delivery.driverId !== null) {
            return sendResponse(res, errors.alreadyAssigned);
        }
        delivery.status = deliveryModel.statuses.cancelled;
        await delivery.save();
        res.status(200).send({cancelled: true});
        await notifyNearbyDrivers(delivery, "delivery-cancelled");
    }

    async function confirmDeposit(req, res) {
        const {id} = req.user.token;
        const {delivery} = req;
        if (delivery.clientId !== id) {
            return sendResponse(res, errors.notAuthorized);
        }
        if (delivery.status !== deliveryModel.statuses.toBeConfirmed) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        delivery.status = deliveryModel.statuses.started;
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

    async function rateDelivery(req, res) {
        const {note} = req.body;
        const {delivery} = req;

        if (delivery.note !== null) {
            return sendResponse(res, errors.alreadyRated);
        }
        if (delivery.status !== deliveryModel.statuses.terminated) {
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

    async function getInfos(req, res) {
        let {delivery} = req;
        let client;
        let driver;
        client = await delivery.getClient();
        driver = await delivery.getDriver();
        delivery = delivery.toResponse();
        delivery.client = client;
        delivery.driver = driver;
        res.status(200).send(delivery);
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

    async function signalReception(req, res) {
        const {id} = req.user.token;
        const {delivery} = req;
        if (delivery.driverId !== id) {
            return sendResponse(res, errors.notAuthorized);
        }
        if (delivery.status !== deliveryModel.statuses.pendingReception) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        delivery.status = deliveryModel.statuses.toBeConfirmed;
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
            delivery.status = deliveryModel.statuses.terminated;
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


    return Object.freeze({
        acceptDelivery,
        canAccessDelivery,
        cancelDelivery,
        confirmDeposit,
        ensureCanTerminate,
        ensureDeliveryExists,
        getAllPaginated,
        getInfos,
/*jslint-disable*/
        getPrice,
/*jslint-enable*/
        rateDelivery,
        requestDelivery,
        signalReception,
        terminateDelivery
    });
}

module.exports = getDeliveryModule;