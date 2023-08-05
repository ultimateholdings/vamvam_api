/*jslint
node
*/

const buildAuthRoutes = require("./auth.route");
const buildUserRoutes = require("./user.route");
const buildDeliveryRoutes = require("./delivery.route");
const buildMessageRoutes = require("./message.route");
const buildRoomRoutes = require("./room.route");
const {Router} = require("express");

function buildRoutes({
    authRoutes,
    deliveryRoutes,
    userRoutes,
    messageRoutes,
    roomRoutes
}) {
    const authRouter = authRoutes || buildAuthRoutes();
    const userRouter = userRoutes || buildUserRoutes();
    const deliveryRouter = deliveryRoutes || buildDeliveryRoutes();
    const messageRouter = messageRoutes || buildMessageRoutes();
    const roomRouter = roomRoutes || buildRoomRoutes();
    const router = new Router();
    router.use("/auth", authRouter);
    router.use("/user", userRouter);
    router.use("/delivery", deliveryRouter);
    router.use("/message", messageRouter);
    router.use("/room", roomRouter)
    return router;
}

module.exports = buildRoutes;
