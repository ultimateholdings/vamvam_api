const { Transaction, Payment, Bundle, Delivery, User } = require("../models");
const {
  errors,
  responseMessage,
  staticPaymentProps,
} = require("../utils/config");
const { FLW_SECRET_HASH } = process.env;
const {
  propertiesPicker,
  sendResponse,
  getPaymentService,
  paymentManager,
  calculateSolde,
} = require("../utils/helpers");

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
  modelBundle,
  deliveryModel,
  paymentHan,
  modelUser,
}) {
  const transactionModel = modelTrans || Transaction;
  const paymentModel = modelPay || Payment;
  const bundleModel = modelBundle || Bundle;
  const deliveriesModel = deliveryModel || Delivery;
  const userModel = modelUser || User;
  const paymentHandler =
    paymentHan || paymentManager(getPaymentService(paymentModel, bundleModel));
  const genericProps = ["point", "bonus", "userId"];

  deliveriesModel.addEventListener("can-delivery", subscriberDeliverers);
  deliveriesModel.addEventListener("point-withdrawal", withdrawal);

  async function canAccess(req, res, next) {
    let payment;
    const secretHash = FLW_SECRET_HASH;
    const signature = req.headers["verif-hash"];
    const { status, id } = req.body.data;
    if (signature !== secretHash) {
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
        driverId: payment.driverId,
      });
    }
  }

  async function ensureBundleExists(req, res, next) {
    const {packId} = req.body;
    let bundle;
    if (typeof packId !== "string" || packId === "") {
      return sendResponse(res, errors.invalidValues);
    }
    bundle = await bundleModel.findOne({ where: { id: packId } });
    if (bundle === null) {
      return sendResponse(res, errors.notFound);
    }
    req.bundle = bundle;
    next();
  }

  async function initTrans(req, res) {
    const { id: driverId } = req.user.token;
    const { phone_number } = req.body;
    const { point, unitPrice, id: packId } = req.bundle;
    const amount = calculateSolde(point, unitPrice);
    let { lastName, firstName, email } = await userModel.findOne({
      where: { id: driverId },
      attributes: ["firstName", "lastName", "email"],
    });
    const fullname = lastName + " " + firstName;
    let payload = {
      phone_number: phone_number,
      amount: amount,
      email: email,
      fullname: fullname,
      currency: staticPaymentProps.currency,
      country: staticPaymentProps.country,
      tx_ref: staticPaymentProps.tx_ref,
    };
    const { init, code, message } = await paymentHandler.initTransaction(
      payload,
      driverId,
      packId
    );
    if (init === true) {
      res.status(200).send({});
      deliveriesModel.emitEvent("payment-initiated", {
        driverId: driverId,
      });
    } else {
      res.status(code).send({ message });
    }
  }

  async function finalizePayment(req, res) {
    const { id } = req.body.data;
    try {
      const { verifiedTrans, data } = await paymentHandler.verifyTransaction(
        id
      );
      if (verifiedTrans) {
        await reloadBalance(data);
        res.status(200).json({});
        deliveriesModel.emitEvent("successful-payment", { data: data });
      } else {
        res.status(401).end();
        deliveriesModel.emitEvent("failure-payment", {
          driverId: driverId,
        });
      }
    } catch (error) {
      return sendResponse(res, errors.internalError);
    }
  }

  async function reloadBalance(data) {
    return await transactionModel.create(data);
  }

  async function balenceInfos(driverId) {
    let rechargeSum;
    let retraitSum;
    let bonusAdded;
    let bonusWithdraw;
    rechargeSum = await transactionModel.sum("point", {
      where: {
        driverId: driverId,
        type: "recharge",
      },
    });
    retraitSum = await transactionModel.sum("point", {
      where: {
        driverId: driverId,
        type: "withdrawal",
      },
    });
    bonusAdded = await transactionModel.sum("bonus", {
      where: {
        driverId: driverId,
        type: "recharge",
      },
    });
    bonusWithdraw = await transactionModel.sum("bonus", {
      where: {
        driverId: driverId,
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
    const { data } = req.body;
    let createdProps;
    const pickedProperties = propertiesPicker(data);
    createdProps = pickedProperties(genericProps);
    if (createdProps !== undefined) {
      const { subtract } = await balenceInfos(createdProps.userId);
      if (subtract) {
        const { bonus, point, type, unitPrice } = await transactionModel.create(
          {
            bonus: createdProps.bonus,
            point: createdProps.point,
            type: staticPaymentProps.debit_type,
            unitPrice: staticPaymentProps.debit_amount,
            userId: createdProps.userId,
          }
        );
        return {
          data: {
            bonus,
            point,
            type,
            unitPrice,
          },
          message: responseMessage.successWithdrawal,
        };
      } else {
        return {
          message: responseMessage.emptyWallet,
        };
      }
    } else {
      sendResponse(res, errors.invalidValues);
    }
  }

  async function subscriberDeliverers(data) {
    const users = await Promise.all(
      data.map(async (id) => {
        const { subtract } = await balenceInfos(id);
        if (subtract) {
          return id;
        }
      })
    );
    return users.filter((id) => id !== undefined);
  }

  async function transactionHistory(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const offset = (page - 1) * limit;
    const { id: driverId } = req.user.token;
    const { type } = req.body;
    let { rows } = await transactionModel.getAllByType({
      limit,
      offset,
      driverId,
      type,
    });
    res.status(200).json(rows);
  }

  async function wallet(req, res) {
    const { id } = req.user.token;
    let data = await balenceInfos(id);
    res.status(200).json({
      wallet: data,
    });
  }

  async function rechargeHistory(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const offset = (page - 1) * limit;
    try {
      const { startDate, endDate } = req.body;
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const { rows, count } = await transactionModel.getAllByTime({
        limit,
        offset,
        start,
        end,
      });
      res.status(200).json({
        data: rows,
        total: count,
      });
    } catch (error) {
      sendResponse(res, errors.internalError);
    }
  }

  async function rechargeInfos(req, res) {
    try {
      let rechargeSum;
      let bonusSum;
      rechargeSum = await transactionModel.sum("point", {
        where: {
          type: "recharge",
        },
      });
      bonusSum = await transactionModel.sum("bonus", {
        where: {
          type: "recharge",
        },
      });
      const solde = calculateSolde(rechargeSum);
      res.status(200).json({
        point: rechargeSum,
        bonus: bonusSum,
        solde: solde,
      });
    } catch (error) {
      sendResponse(res, errors.internalError);
    }
  }
  return Object.freeze({
    canAccess,
    ensureBundleExists,
    transactionHistory,
    initTrans,
    finalizePayment,
    wallet,
    rechargeHistory,
    rechargeInfos,
  });
}
module.exports = getTransactionModule;
