/*jslint
node
*/

const buildAuthRoutes = require("./auth.route");
const buildUserRoutes = require("./user.route");
const buildDeliveryRoutes = require("./delivery.route");
const buildBundleRoutes = require("./bundle.route");
const buildRechargeRoutes = require("./transaction.route");
const buildRegistrationRoutes = require("./driver.route");
const buildChatRoutes = require("./chat.route");
const buildWebhookRoutes = require("./webhook.route");
const buildAdminRoutes = require("./admin.route");
const {Router} = require("express");

function buildRoutes({
    adminRoutes,
    authRoutes,
    chatRoutes,
    deliveryRoutes,
    userRoutes,
    bundleRoutes,
    rechargeRoutes,
    registrationRoutes,
    webhookRoutes
}) {
    const authRouter = authRoutes || buildAuthRoutes();
    const userRouter = userRoutes || buildUserRoutes();
    const deliveryRouter = deliveryRoutes || buildDeliveryRoutes();
    const bundleRouter = bundleRoutes || buildBundleRoutes();
    const rechargeRouter = rechargeRoutes || buildRechargeRoutes();
    const registrationRouter = registrationRoutes || buildRegistrationRoutes();
    const chatRouter = chatRoutes || buildChatRoutes();
    const webhookRouter = webhookRoutes || buildWebhookRoutes();
    const adminRouter = adminRoutes || buildAdminRoutes();
    const router = new Router();
    router.use("/auth", authRouter);
    router.use("/user", userRouter);
    router.use("/delivery", deliveryRouter);
    router.use("/bundle", bundleRouter);
    router.use("/transaction", rechargeRouter);
    router.use("/driver", registrationRouter);
    router.use("/discussion", chatRouter);
    router.use("/flw-webhook", webhookRouter);
    router.use("/admin", adminRouter);
    return router;
}

module.exports = buildRoutes;
