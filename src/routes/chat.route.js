/*jslint
node
*/

const express = require("express");
const getChatModule = require("../modules/chat.module");
const {errorHandler} = require("../utils/helpers");
const {availableRoles: roles} = require("../utils/config");
const {
    allowRoles,
    protectRoute
} = require("../utils/middlewares");

function getChatRouter(module) {
    const chatModule = module || getChatModule({});
    const router = new express.Router();

    router.post(
        "/new-message",
        protectRoute,
        allowRoles([roles.clientRole, roles.driverRole]),
        chatModule.ensureRoomExists,
        chatModule.ensureUserInRoom,
        errorHandler(chatModule.sendMessage)
    );
    router.get(
        "/messages",
        protectRoute,
        allowRoles([roles.clientRole, roles.driverRole]),
        chatModule.ensureRoomExists,
        chatModule.ensureUserInRoom,
        errorHandler(chatModule.getRoomMessages)
    );
    router.get(
        "/all",
        protectRoute,
        allowRoles([roles.clientRole, roles.driverRole]),
        errorHandler(chatModule.getRooms)
    );
    return router;
}

module.exports = getChatRouter;