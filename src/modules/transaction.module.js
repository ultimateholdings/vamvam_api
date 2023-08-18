const { Transaction } = require("../models");
const { errors, availableRoles: roles } = require("../utils/config");
const {
  propertiesPicker,
  sendResponse,
  paymentManager,
} = require("../utils/helpers");

function getTransactionModule({ model, payment }) {
  const transactionModel = model || Transaction;
  const paymentHandler = payment || paymentManager();
  const genericProps = ["bonus", "point", "type"];
  const transactionProps = ["phone_number", "amount", "email"];

  const staticProps = {
    country: "CM",
    currency: "XAF",
    tx_ref: "transfer-"+Date.now(),
    debit_amount: 300
  }

  async function initTrans(paymentProps) {
    const data = {
      phone_number: paymentProps.phone_number,
      amount: paymentProps.amount,
      currency: staticProps.currency,
      country: staticProps.country,
      email: paymentProps.email,
      tx_ref: staticProps.tx_ref
    };
    const response = await paymentHandler.initTransaction(data);
    return response;
  }

  async function verifyTrans(transactionId) {
    let isVerified = await paymentHandler.verifyTransaction(transactionId);
    if (isVerified) {
      return true;
    } else {
      return false;
    }
  }

  function canSubtract(pointSum, bonusSum) {
    if (pointSum + bonusSum === 0) {
      return false;
    } else {
      return true;
    }
  }

  async function balenceInfos(userId) {
    let rechargeSum;
    let retraitSum;
    let bonusAdded;
    let bonusWithdraw;
    let amountAdder;
    let amountWithdrawal;
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
    amountAdder = await transactionModel.sum("amount", {
      where: {
        userId: userId,
        type: "recharge",
      },
    });
    amountWithdrawal = await transactionModel.sum("amount", {
      where: {
        userId: userId,
        type: "withdrawal",
      },
    });
    const pointSum = rechargeSum - retraitSum;
    const bonusSum = bonusAdded - bonusWithdraw;
    const solde = amountAdder - amountWithdrawal;
    const subtract = canSubtract(pointSum, bonusSum);
    return {
      point: pointSum,
      bonus: bonusSum,
      solde: solde,
      subtract: subtract,
    };
  }

  async function reloadBalance(req, res) {
    let createdProps;
    let paymentProps;
    let isVerified;
    let recharge;
    const { payload } = req.body;
    const { id: userId } = req.user.token;

    const pickedProperties = propertiesPicker(req.body);
    createdProps = pickedProperties(genericProps);

    const paymentProperties = propertiesPicker(payload);
    paymentProps = paymentProperties(transactionProps);

    if (createdProps !== undefined || paymentProps !== undefined) {
      recharge = await initTrans(paymentProps);
      isVerified = await verifyTrans(recharge.data.id);
      if (isVerified) {
        await transactionModel.create({
          point: createdProps.point,
          bonus: createdProps.bonus,
          amount: paymentProps.amount,
          userId: userId,
        });
        res.status(200).json({
          succes: true,
          message: {
            en: "Recharge add with success!",
          },
        });
      } else {
        res.status(400).json({ valid: false });
      }
    } else {
      sendResponse(res, errors.invalidValues);
    }
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
        succes: true,
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
    reloadBalance,
    withdrawal,
    transactionHistory,
    walletInfos,
  });
}
module.exports = getTransactionModule;
