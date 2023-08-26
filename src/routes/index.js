/*jslint
node
*/

const buildAuthRoutes = require("./auth.route");
const buildUserRoutes = require("./user.route");
const buildDeliveryRoutes = require("./delivery.route");
const buildSubscriptionRoutes = require("./subscription.route");
const buildRechargeRoutes = require("./transaction.route");
const buildWebhookRoutes = require("./webhook.route");
const buildRegistrationRoutes = require("./driver.route");
const buildChatRoutes = require("./chat.route");
const buildAdminRoutes = require("./admin.route");
const {Router} = require("express");

function buildRoutes({
    adminRoutes,
    authRoutes,
    chatRoutes,
    deliveryRoutes,
    userRoutes,
    subscriptionRoutes,
    rechargeRoutes,
    registrationRoutes,
    userRoutes,
    webhookRoutes,
}) {
    const authRouter = authRoutes || buildAuthRoutes();
    const userRouter = userRoutes || buildUserRoutes();
    const deliveryRouter = deliveryRoutes || buildDeliveryRoutes();
    const subcriptionRouter = subscriptionRoutes || buildSubscriptionRoutes();
    const rechargeRouter = rechargeRoutes || buildRechargeRoutes();
    const webhookRouter = webhookRoutes || buildWebhookRoutes();
    const registrationRouter = registrationRoutes || buildRegistrationRoutes();
    const chatRouter = chatRoutes || buildChatRoutes();
    const adminRouter = adminRoutes || buildAdminRoutes();
    const router = new Router();
    router.use("/auth", authRouter);
    router.use("/user", userRouter);
    router.use("/delivery", deliveryRouter);
    router.use("/subscription", subcriptionRouter);
    router.use("/transaction", rechargeRouter);
    router.use("/flw-webhook", webhookRouter)
    router.use("/driver", registrationRouter);
    router.use("/discussion", chatRouter);
    router.use("/admin", adminRouter);
    return router;
}

module.exports = buildRoutes;
