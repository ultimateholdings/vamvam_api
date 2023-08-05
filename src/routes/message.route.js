const express = require("express");
const getMessageModule = require("../modules/message.module");
const {
    protectRoute
} = require("../utils/middlewares");
const { errorHandler } = require("../utils/helpers");


function getMessageRoutes (messageModule) {
    const routerModule = messageModule || getMessageModule({});
    const router = express.Router();
    router.post(
        "/new-message",
        protectRoute,
        errorHandler(routerModule.createMessage)
    );
    router.get(
        "/infos",
        protectRoute,
        errorHandler(routerModule.getMessageInfos)
    );
    router.get(
        "/room-messages",
        protectRoute,
        errorHandler(routerModule.getRoomMessages)
    );
    router.post(
        "/update-reader",
        protectRoute,
        errorHandler(routerModule.updateMessageReader)
    );
    return router;
}

module.exports = getMessageRoutes;