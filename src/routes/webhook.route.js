const express = require("express");
const getTransactionModule = require("../modules/transaction.module");

function getTransactionRouter(module){
    const transactonModule = module || getTransactionModule({});
    const router = new express.Router();
    router.post(
        "/",
        transactonModule.canAccess,
        transactonModule.finalizePayment
    );
    return router;
}
module.exports = getTransactionRouter;