/*jslint
node
*/
const express = require("express");
const getSubscriptionModule = require("../modules/subscription.module");
const {errorHandler} = require("../utils/helpers");
const {
    protectRoute
} = require("../utils/middlewares");
function getSubscriptionRouter(module) {
    const subscriptionModule = module || getSubscriptionModule({});
    const router = new express.Router();
    router.post(
        "/new-subscription",
        protectRoute,
        subscriptionModule.canAccessToSubscription,
        errorHandler(subscriptionModule.createSubscription)
    );
    router.get(
        "/infos",
        protectRoute,
        errorHandler(subscriptionModule.getSubscriptionInfos)
    );
    router.get(
        "/",
        protectRoute,
        errorHandler(subscriptionModule.getBunchs)
        );
    router.post(
        "/update",
        protectRoute,
        subscriptionModule.canAccessToSubscription,
        errorHandler(subscriptionModule.updateBunch)
    )
    router.post(
        "/delete",
        protectRoute,
        subscriptionModule.canAccessToSubscription,
        errorHandler(subscriptionModule.deleteBunch)
    )
    return router;
}
module.exports = getSubscriptionRouter;