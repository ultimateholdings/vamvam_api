/*jslint
node
*/

const buildAuthRoutes = require("./auth.route");
const buildUserRoutes = require("./user.route");
const buildDeliveryRoutes = require("./delivery.route");
const buildRegistrationRoutes = require("./driver.route");
const buildMessageRoutes = require("./message.route");
const buildRoomRoutes = require("./room.route");
const buildChatRoutes = require("./chat.route");
const {Router} = require("express");

function buildRoutes({
    authRoutes,
    chatRoutes,
    deliveryRoutes,
    registrationRoutes,
    userRoutes,
    messageRoutes,
    roomRoutes
}) {
    const authRouter = authRoutes || buildAuthRoutes();
    const userRouter = userRoutes || buildUserRoutes();
    const deliveryRouter = deliveryRoutes || buildDeliveryRoutes();
    const registrationRouter = registrationRoutes || buildRegistrationRoutes();
    const messageRouter = messageRoutes || buildMessageRoutes();
    const roomRouter = roomRoutes || buildRoomRoutes();
    const chatRouter = chatRoutes || buildChatRoutes();
    const router = new Router();
    router.use("/auth", authRouter);
    router.use("/user", userRouter);
    router.use("/delivery", deliveryRouter);
    router.use("/driver", registrationRouter);
    router.use("/message", messageRouter);
    router.use("/room", roomRouter);
    router.use("/discussion", chatRouter);
    return router;
}

module.exports = buildRoutes;
