/*jslint
node
*/

const buildAuthRoutes = require("./auth.route");
const buildUserRoutes = require("./user.route");
const buildDeliveryRoutes = require("./delivery.route");
const buildSubscriptionRoutes = require("./subscription.route");
const buildRechargeRoutes = require("./transaction.route");
const {Router} = require("express");

function buildRoutes({
    authRoutes,
    deliveryRoutes,
    userRoutes,
    subscriptionRoutes,
    rechargeRoutes
}) {
    const authRouter = authRoutes || buildAuthRoutes();
    const userRouter = userRoutes || buildUserRoutes();
    const deliveryRouter = deliveryRoutes || buildDeliveryRoutes();
    const subcriptionRouter = subscriptionRoutes || buildSubscriptionRoutes();
    const rechargeRouter = rechargeRoutes || buildRechargeRoutes();
    const router = new Router();
    router.use("/auth", authRouter);
    router.use("/user", userRouter);
    router.use("/delivery", deliveryRouter);
    router.use("/subscription", subcriptionRouter);
    router.use("/transaction", rechargeRouter);
    return router;
}

module.exports = buildRoutes;
