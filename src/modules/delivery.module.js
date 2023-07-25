/*jslint
node
*/
const crypto = require("crypto");
const {Delivery, User} = require("../models");
const {availableRoles: roles, errors} = require("../utils/config");
const {isValidLocation} = require("../utils/helpers");


function getDeliveryModule({associatedModels, model}) {
    const deliveryModel = model || Delivery;
    const associations = associatedModels || {User};

    async function generateCode(byteSize = 5) {
        const {
            default: encoder
        } = await import("base32-encode");
        return encoder(crypto.randomBytes(byteSize), "Crockford");
    }

    function calculatePrice() {
        return 1000;
    }

    function sendResponse(res, content, data = {}) {
        res.status(content.status).send({
            data,
            message: content.message
        });
    }

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

        if (delivery.driverId !== id ) {
            return sendResponse(res, errors.notAuthorized);
        }
        if (delivery.status !== started) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        if (delivery.code !== code) {
            return sendResponse(res, errors.invalidCode)
        }
        req.canTerminate = true;
        next();
    }

    function formatBody(body) {
        const result = Object.entries(body).reduce(
            function (acc, [key, value]) {
                const locationProps = ["departure", "destination"];
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

    async function acceptDelivery(req, res) {
        let driver;
        const {id: userId, phone} = req.user.token;
        const {delivery} = req;
        if (delivery.driverId !== null) {
            return sendResponse(res, errors.alreadyAssigned);
        }
        if (delivery.status === deliveryModel.statuses.cancelled) {
            return sendResponse(res, errors.alreadyCancelled);
        }
        driver = await associations.User.findOne({
            where: {phone, id: userId}
        });
        delivery.status = deliveryModel.statuses.pendingReception;
        await delivery.save();
        await delivery.setDriver(driver);
        return res.status(200).send({
            accepted: true
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

    function getPrice(req, res) {
        res.status(200).send({
            price: calculatePrice()
        });
    }

    async function cancelDelivery(req, res) {
        const {id: userId} = req.user.token;
        const {delivery} = req;
        if (delivery.clientId !== userId) {
            return sendResponse(res, errors.notAuthorized, {cancelled: false});
        }
        if (delivery.driverId !== null) {
            return sendResponse(res, errors.alreadyAssigned);
        }
        delivery.status = deliveryModel.statuses.cancelled;
        await delivery.save();
        res.status(200).send({cancelled: true})
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
        await delivery.save();
        res.status(200).send({started: true});
    }

    async function requestDelivery(req, res) {
        const {id, phone} = req.user.token;
        let user;
        let body;
        let tmp;
        try {
            body = formatBody(req.body);
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
    }

    async function getInfos(req, res) {
        let {delivery} = req;
        let client;
        let driver;
        debugger;
        client = await delivery.getClient();
        driver = await delivery.getDriver();
        delivery = delivery.toResponse();
        delivery.client = client;
        delivery.driver = driver;
        res.status(200).json(delivery);
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
    }

    async function terminateDelivery(req, res) {
        const {canTerminate, delivery} = req;
        if (canTerminate === true) {
            await deliveryModel?.update(
                {status: deliveryModel.statuses.terminated},
                {where: {id: delivery.id}}
            );
            deliveryModel?.emitEvent(
                "delivery-end",
                {clientId: delivery.clientId, deliveryId: delivery.id}
            );
            res.status(200).send({
                terminated: true
            });
        } else {
            return sendResponse(res, errors.cannotPerformAction, {canTerminate});
        }
    }

    return Object.freeze({
        acceptDelivery,
        canAccessDelivery,
        cancelDelivery,
        confirmDeposit,
        ensureCanTerminate,
        ensureDeliveryExists,
        getInfos,
        getPrice,
        requestDelivery,
        signalReception,
        terminateDelivery
    });
}

module.exports = getDeliveryModule;