/*jslint
node
*/
const crypto = require("crypto");
const {Delivery, User} = require("../models");
const {errors} = require("../utils/config");
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

    function send404(res) {
        res.status(errors.notFound.status).send({
            message: errors.notFound.message
        });
    }

    async function handleClosing({code, delivery, userId}) {
        const canTerminate = delivery.code === code &&
        delivery.driverId === userId &&
        delivery.status === "started";
        if (delivery.code !== code) {
            return {
                body: {message: "Invalid code, Try again"},
                status: 400
            };
        }
        if (delivery.status !== "started") {
            return {
                body: {message: errors.cannotPerformAction.message},
                status: errors.cannotPerformAction.status
            }
        }
        if (canTerminate) {
            await deliveryModel.update({status: "terminated"}, {
                where: {
                    id: delivery.id
                }
            });
            deliveryModel?.emitEvent(
                "delivery-end",
                {clientId: delivery.clientId, deliveryId: delivery.id}
            );
            return {
                body: {terminated: true},
                status: 200
            };
        } else {
            return {
                body: {
                    message: errors.notAuthorized.message
                },
                status: errors.notAuthorized.status
            };
        }
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

    async function requestDelivery(req, res) {
        const {id, phone} = req.user.token;
        let user;
        let body;
        let tmp;
        try {
            body = formatBody(req.body);
        } catch (error) {
            res.status(errors.invalidLocation.status).send({
                content: error.message,
                message: errors.invalidLocation.message
            });
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
        const {
            id: userId
        } = req.user.token;
        const {id} = req.body;
        let client;
        let driver;
        let delivery = await deliveryModel.findOne({where: {id}});
        if (delivery === null) {
            send404(res);
        }
        client = await delivery.getClient();
        driver = await delivery.getDriver();
        if (client?.id !== userId && driver?.id !== userId) {
            res.status(errors.notAuthorized.status).send({
                message: errors.notAuthorized.message
            });
        } else {
            delivery = delivery.toResponse();
            delivery.client = client;
            delivery.driver = driver;
            res.status(200).json(delivery);
        }
    }

    async function terminateDelivery(req, res) {
        const {
            id: userId
        } = req.user.token;
        const {code, id} = req.body;
        let closing;
        let delivery = await deliveryModel.findOne({where: {id}})
        if (delivery === null) {
            send404(res);
        } else {
            closing = await handleClosing({code, delivery, res, userId});
            res.status(closing.status).json(closing.body);
        }
    }

    return Object.freeze({
        getInfos,
        requestDelivery,
        terminateDelivery
    });
}

module.exports = getDeliveryModule;