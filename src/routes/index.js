/*jslint
node
*/

const buildAuthRoutes = require("./auth.route");
const buildUserRoutes = require("./user.route");
const buildDeliveryRoutes = require("./delivery.route");
const buildSubscriptionRoutes = require("./subscription.route");
const buildRechargeRoutes = require("./transaction.route");
const buildWebhookRoutes = require("./webhook.route");
const {Router} = require("express");

function buildRoutes({
    authRoutes,
    deliveryRoutes,
    userRoutes,
    subscriptionRoutes,
    rechargeRoutes,
    webhookRoutes
}) {
    const authRouter = authRoutes || buildAuthRoutes();
    const userRouter = userRoutes || buildUserRoutes();
    const deliveryRouter = deliveryRoutes || buildDeliveryRoutes();
    const subcriptionRouter = subscriptionRoutes || buildSubscriptionRoutes();
    const rechargeRouter = rechargeRoutes || buildRechargeRoutes();
    const webhookRouter = webhookRoutes || buildWebhookRoutes();
    const router = new Router();
    router.use("/auth", authRouter);
    router.use("/user", userRouter);
    router.use("/delivery", deliveryRouter);
    router.use("/subscription", subcriptionRouter);
    router.use("/transaction", rechargeRouter);
    router.use("/flw-webhook", webhookRouter)
    return router;
}

module.exports = buildRoutes;
