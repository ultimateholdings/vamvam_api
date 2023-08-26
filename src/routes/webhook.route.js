const express = require("express");
const getTransactionModule = require("../modules/transaction.module");
const {errorHandler} = require("../utils/helpers");

function getWebhookRouter(module){
    const transactonModule = module || getTransactionModule({});
    const router = new express.Router();
    router.post(
        "/",
        transactonModule.canAccess,
        transactonModule.listenWebHook
    );
    return router;
}
module.exports = getWebhookRouter;