const crypto = require("crypto");
const {Delivery, User} = require("../models");


function getDeliveryModule ({model, associatedModels}) {
    const deliveryModel = model || Delivery;
    const associations = associatedModels || {User};

    async function generateCode (byteSize = 5) {
        const {default: encoder} = await import("base32-encode");
        return encoder(crypto.randomBytes(byteSize), "Crockford");
    }

    function calculatePrice() {
        return 1000;
    }

    function formatBody (body) {
        const result = Object.entries(body).reduce(function (acc,[key, value]) {
            const locationProps = ["departure", "destination"];
            if (acc.deliveryMeta === undefined) {
                acc.deliveryMeta = {};
            }
            if (locationProps.includes(key)) {
                acc[key] = {
                    coordinates: [value?.latitude, value?.longitude],
                    type: "Point"
                };
                acc.deliveryMeta[key + "Address"] = value.address;
            } else {
                acc[key] = value;
            }
            return acc;
        }, Object.create(null));
        return result;
    }

    async function requestDelivery (req, res) {
        const {token:{id, phone}} = req.user;
        const body = formatBody(req.body);
        const user = await associations.User.findOne({where: {phone, id}});
        let tmp = await generateCode();
        body.price = calculatePrice();
        body.code  = tmp;
        tmp = await deliveryModel.create(body);
        await tmp.setClient(user);
        res.status(200).send({
            code: body.code,
            id: tmp.id,
            price: body.price
        });
    }

    return Object.freeze({
        requestDelivery
    });
}

module.exports = getDeliveryModule;