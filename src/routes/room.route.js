const express = require("express");
const getRoomModule = require("../modules/room.module");
const {protectRoute} = require("../utils/middlewares");
const { errorHandler } = require("../utils/helpers");


function getRoomRoutes (messageModule) {
    const routerModule = messageModule || getRoomModule({});
    const router = express.Router();
    router.post(
        "/new-room",
        errorHandler(routerModule.createRoom)
    );
    router.get(
        "/:roomId",
        errorHandler(routerModule.getRoom)
    );
    router.get(
        "/user-rooms/:userId",
        errorHandler(routerModule.getUserRooms)
    );
    router.delete(
        "/:roomId",
        errorHandler(routerModule.deleteRoom)
    );
    return router;
}

module.exports = getRoomRoutes;