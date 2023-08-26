const { where } = require("sequelize");
const { Transaction, Payment, Subscription, Delivery } = require("../models");
const { errors, availableRoles: roles } = require("../utils/config");
const { FLW_SECRET_HASH } = process.env;
const {
  propertiesPicker,
  sendResponse,
  getPaymentService,
  paymentManager,
} = require("../utils/helpers");

function calculateSolde(point, unitPrice = 300) {
  return point * unitPrice;
}
function canSubtract(pointSum, bonusSum) {
  if (pointSum + bonusSum === 0) {
    return false;
  } else {
    return true;
  }
}
function getTransactionModule({
  modelTrans,
  modelPay,
  modelSubs,
  deliveryModel,
  paymentHan,
}) {
  const transactionModel = modelTrans || Transaction;
  const paymentModel = modelPay || Payment;
  const subscriptionModel = modelSubs || Subscription;
  const deliveriesModel = deliveryModel || Delivery;
  const paymentHandler =
    paymentHan ||
    paymentManager(getPaymentService(paymentModel, subscriptionModel));
  const genericProps = ["bonus", "point", "type"];

  const staticProps = {
    country: "CM",
    currency: "XAF",
    tx_ref: "transfer-" + Date.now(),
    debit_amount: 300,
  };

  async function canAccess(req, res, next) {
    let payment;
    const secretHash = FLW_SECRET_HASH;
    const signature = req.headers["verif-hash"];
    const { status, id } = req.body.data;
    if (!signature || signature !== secretHash) {
      return sendResponse(res, errors.notAuthorized);
    }
    if (status === "successful") {
      next();
    } else {
      payment = await paymentModel.findOne({
        where: {
          transId: id,
          isVerify: false,
        },
      });
      deliveriesModel.emitEvent("failure-payment", {
        userId: payment.customerId,
      });
    }
  }

  async function initTrans(req, res) {
    let { payload, packId } = req.body;
    const { id: customerId } = req.user.token;
    payload.currency = staticProps.currency;
    payload.country = staticProps.country;
    payload.tx_ref = staticProps.tx_ref;
    const { init, code, message } = await paymentHandler.initTransaction(
      payload,
      customerId,
      packId
    );
    if (init === true) {
      deliveriesModel.emitEvent("payment-initiated", {
        userId: customerId,
      });
      res.status(200).send({});
    } else {
      res.status(code).send({ message });
    }
  }

  async function listenWebHook(req, res) {
    let response;
    const { id } = req.body.data;
    try {
      response = await paymentHandler.verifyTransaction(id);
      if (response.verifiedTrans) {
        await reloadBalance(response.data);
        res.status(200).end({});
        deliveriesModel.emitEvent("successful-payment", {
          userId: customerId,
        });
      } else {
        res.status(401).end();
        deliveriesModel.emitEvent("failure-payment", {
          userId: customerId,
        });
      }
    } catch (error) {
      return error;
    }
  }

  async function reloadBalance(data) {
    return await transactionModel.create(data);
  }

  async function balenceInfos(userId) {
    let rechargeSum;
    let retraitSum;
    let bonusAdded;
    let bonusWithdraw;
    rechargeSum = await transactionModel.sum("point", {
      where: {
        userId: userId,
        type: "recharge",
      },
    });
    retraitSum = await transactionModel.sum("point", {
      where: {
        userId: userId,
        type: "withdrawal",
      },
    });
    bonusAdded = await transactionModel.sum("bonus", {
      where: {
        userId: userId,
        type: "recharge",
      },
    });
    bonusWithdraw = await transactionModel.sum("bonus", {
      where: {
        userId: userId,
        type: "withdrawal",
      },
    });
    const pointSum = rechargeSum - retraitSum;
    const bonusSum = bonusAdded - bonusWithdraw;
    const solde = calculateSolde(pointSum);
    const subtract = canSubtract(pointSum, bonusSum);
    return {
      point: pointSum,
      bonus: bonusSum,
      solde: solde,
      subtract: subtract,
    };
  }

  async function withdrawal(req, res) {
    let createdProps;
    let isVerified;
    const { id: userId } = req.user.token;
    const pickedProperties = propertiesPicker(req.body);
    createdProps = pickedProperties(genericProps);
    if (createdProps !== undefined) {
      isVerified = await balenceInfos(userId);
      if (isVerified.subtract) {
        await transactionModel.create({
          point: createdProps.point,
          bonus: createdProps.bonus,
          amount: staticProps.debit_amount,
          type: createdProps.type,
          userId: userId,
        });
        return {
          succes: true,
          message: {
            en: "successful withdrawal!",
          },
        };
      } else {
        return {
          succes: false,
          message: {
            en: "An empty wallet cannot be debited!",
          },
        };
      }
    } else {
      return {
        succes: false,
        message: errors.invalidValues,
      };
    }
  }

  async function transactionHistory(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const offset = (page - 1) * limit;
    const { id: userId } = req.user.token;
    let wallet = await balenceInfos(userId);
    let response = await transactionModel.findAndCountAll({
      where: {
        userId: userId,
      },
      limit: limit,
      offset: offset,
      order: [["createdAt", "DESC"]],
    });
    if (response !== null) {
      res.status(200).json({
        point: wallet.point,
        bonus: wallet.bonus,
        solde: wallet.solde,
        canDeliver: wallet.subtract,
        data: response.rows,
      });
    } else {
      sendResponse(res, errors.notFound);
    }
  }

  async function walletInfos(req, res) {
    const { id: userId } = req.user.token;
    let response = await balenceInfos(userId);
    if (response !== null) {
      res.status(200).json({
        point: response.point,
        bonus: response.bonus,
        solde: response.solde,
        canDeliver: response.subtract,
      });
    } else {
      sendResponse(res, errors.internalError);
    }
  }

  return Object.freeze({
    withdrawal,
    transactionHistory,
    walletInfos,
    initTrans,
    listenWebHook,
    canAccess,
  });
}
module.exports = getTransactionModule;
