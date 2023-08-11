/*jslint
node
*/

const buildAuthRoutes = require("./auth.route");
const buildUserRoutes = require("./user.route");
const buildDeliveryRoutes = require("./delivery.route");
const buildRegistrationRoutes = require("./driver.route");
const {Router} = require("express");

function buildRoutes({
    authRoutes,
    deliveryRoutes,
    registrationRoutes,
    userRoutes
}) {
    const authRouter = authRoutes || buildAuthRoutes();
    const userRouter = userRoutes || buildUserRoutes();
    const deliveryRouter = deliveryRoutes || buildDeliveryRoutes();
    const registrationRouter = registrationRoutes || buildRegistrationRoutes();
    const router = new Router();
    router.use("/auth", authRouter);
    router.use("/user", userRouter);
    router.use("/delivery", deliveryRouter);
    router.use("/driver", registrationRouter);
    return router;
}

module.exports = buildRoutes;
