const express = require("express");
const getTransactionModule = require("../modules/transaction.module");
const {errorHandler} = require("../utils/helpers");
const {availableRoles: roles} = require("../utils/config");
const {
    allowRoles,
    protectRoute
} = require("../utils/middlewares");

function getTransactionRouter(module){
    const transactonModule = module || getTransactionModule({});
    const router = new express.Router();
    router.post(
        "/init-transaction",
        protectRoute,
        transactonModule.ensureBundleExists,
        errorHandler(transactonModule.initTrans)
    );
    router.post(
        "/verify",
        transactonModule.finalizePayment
    );
    router.get(
        "/history",
        protectRoute,
        errorHandler(transactonModule.transactionHistory)
    );
    router.get(
        "/payment-history",
        protectRoute,
        allowRoles([roles.adminRole]),
        errorHandler(transactonModule.rechargeHistory)
    );
    router.get(
        "/wallet-infos",
        protectRoute,
        errorHandler(transactonModule.wallet)
    );
    router.get(
        "/recharge-infos",
        protectRoute,
        allowRoles([roles.adminRole]),
        errorHandler(transactonModule.rechargeInfos)
    );
    return router;
}
module.exports = getTransactionRouter;