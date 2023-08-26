const express = require("express");
const getTransactionModule = require("../modules/transaction.module");
const {errorHandler} = require("../utils/helpers");
const {
    protectRoute
} = require("../utils/middlewares");

function getTransactionRouter(module){
    const transactonModule = module || getTransactionModule({});
    const router = new express.Router();
    router.post(
        "/init-transaction",
        protectRoute,
        errorHandler(transactonModule.initTrans)
    );
    router.get(
        "/history",
        protectRoute,
        errorHandler(transactonModule.transactionHistory)
    )
    router.get(
        "/wallet",
        protectRoute,
        errorHandler(transactonModule.walletInfos)
    )
    return router;
}
module.exports = getTransactionRouter;