const {Subscription, User} = require("../models");
const defineSubscriptionModel = require("../models/subscription");
const {
    errors,
    availableRoles: roles
} = require("../utils/config");
const {
    propertiesPicker,
    sendResponse
} = require("../utils/helpers");

function calculatePrice(nb_point, unitPrice) {
    return nb_point * unitPrice;
}

function calculateGainMin(nb_point, minDeliveryPrice = 1000) {
    return nb_point * minDeliveryPrice;
}

function getSubscriptionModule({ associatedModels, model }){
    const SubscriptionModel = model || Subscription;
    const associations = associatedModels || {User};
    const SubscriptionProps = ['title', 'bonus', 'point', 'unitPrice'];

    function canAccessToSubscription(req, res, next) {
        const { role } = req.user.token;
        const isAdmin = role === roles.admin;
        if (isAdmin) {
            next();
        } else {
            sendResponse(res, errors.notAuthorized);
        }
    }

    async function ensureSubscriptionExists(req, res, next) {
        const {id} = req.body;
        const subscription = await SubscriptionModel?.findOne({where: {id}});

        if (subscription === null) {
            return sendResponse(res, errors.notFound);
        }
        req.subscription = subscription;
        next();
    }

    async function createSubscription(req, res){
        try {
            let price;
            let gainMin;
            let propertiesCreate;
            const pickedProperties = propertiesPicker(req.body);
            propertiesCreate = pickedProperties(SubscriptionProps);
            if( propertiesCreate !== undefined){
                price = calculatePrice(propertiesCreate.point, propertiesCreate.unitPrice);
                gainMin = calculateGainMin(propertiesCreate.point)
                const subscription = await SubscriptionModel.create({
                    title: propertiesCreate.title,
                    bonus: propertiesCreate.bonus,
                    point: propertiesCreate.point,
                    unitPrice: propertiesCreate.unitPrice,
                    price: price,
                    gainMin: gainMin
                });
                res.status(200).json({
                    succes: true,
                    message: "Subscription create successfully!"
                })
            } else {
                sendResponse(res, errors.invalidValues);
            }
        } catch (error) {
            sendResponse(res, errors.internalError);
        }
    }

    async function getSubscriptionInfos(req, res){
        const { subscriptionId } = req.body;
        try {
            const subscription = await SubscriptionModel.findOne({ where: {
                id: subscriptionId
            }});
            if(subscription != null){
                res.status(200).json({
                    title: subscription.title,
                    bonus: subscription.bonus,
                    point: subscription.point,
                    unitPrice: subscription.unitPrice,
                    price: subscription.price,
                    gainMin: subscription.gainMin
                })
            }
        } catch (error) {
            sendResponse(res, errors.internalError);
        }
    }

    return Object.freeze({
        canAccessToSubscription,
        createSubscription,
        ensureSubscriptionExists,
        getSubscriptionInfos
    });
}

module.exports = getSubscriptionModule