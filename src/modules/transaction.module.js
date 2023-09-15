const { Transaction, Payment, Bundle, Delivery, User } = require("../models");
const {
  errors,
  staticPaymentProps,
  getPaymentConfig
} = require("../utils/config");
const {
  sendResponse,
  getPaymentService,
  paymentManager,
  calculateSolde,
} = require("../utils/helpers");

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

  deliveriesModel.addEventListener("point-withdrawal-requested", withdrawal);

  async function canAccess(req, res, next) {
    let payment;
    const config = getPaymentConfig();
    const secretHash = config.secret_hash;
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
    const { packId } = req.body;
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
    const { phoneNumber } = req.body;
    const { point, unitPrice, id: packId } = req.bundle;
    const amount = calculateSolde(point, unitPrice);
    let { lastName, firstName, email } = await userModel.findOne({
      where: { id: driverId },
      attributes: ["firstName", "lastName", "email"],
    });
    const fullname = lastName + " " + firstName;
    let payload = {
      phone_number: phoneNumber,
      amount: amount,
      email: email,
      fullname: fullname,
      currency: staticPaymentProps.currency,
      country: staticPaymentProps.country,
      tx_ref: staticPaymentProps.tx_ref,
    };
    const {init, code, message} = await paymentHandler.initTransaction(
      payload,
      driverId,
      packId
    );
    if (init === true) {
      res.status(200).send({});
    } else {
      res.status(code).send({message});
    }
  }

  async function finalizePayment(req, res) {
    const {id} = req.body.data;
    try {
      const {verifiedTrans, data} = await paymentHandler.verifyTransaction(
        id
      );
      if (verifiedTrans) {
        const {bonus, point, unitPrice} = await transactionModel.create(data);
        res.status(200).json({});
        deliveriesModel.emitEvent("successful-payment", {
          payload: {
            point,
            bonus: calculateSolde(bonus, unitPrice),
            solde: calculateSolde(point, unitPrice),
          },
          userId: data.driverId
        });
      } else {
        res.status(401).end();
        deliveriesModel.emitEvent("failure-payment", {
          payload: {},
          userId: driverId,
        });
      }
    } catch (error) {
      return sendResponse(res, errors.internalError);
    }
  }

  async function withdrawal(data) {
    let {bonus, driverId, point} = data;
    try {
      await transactionModel.create({
          bonus,
          driverId,
          point,
          type: staticPaymentProps.debit_type,
          unitPrice: staticPaymentProps.debit_amount
      });
      deliveriesModel.emitEvent("point-withdrawal-fulfill", {
        payload: {
          amount: point * staticPaymentProps.debit_amount,
          bonus,
          point
        },
        userId: driverId
      });
    } catch (error) {
      error.desc = "Unhandled exception on driver point widthdrawal request";
      throw error;
    }
  }

  async function incentiveBonus(req, res){
    const {bonus, driverId, type} = req.body;
    try {
      await transactionModel.create({
        bonus,
        driverId,
        point: staticPaymentProps.recharge_point,
        type: type,
        unitPrice: staticPaymentProps.debit_amount
    });
    res.status(200).json({});
    if( type === "recharge"){
      deliveriesModel.emitEvent("incentive-bonus", {
        payload: {
          amount: bonus * staticPaymentProps.debit_amount,
          bonus
        },
        userId: driverId
      });
    } else {
      deliveriesModel.emitEvent("bonus-withdrawal", {
        payload: {
          amount: bonus * staticPaymentProps.debit_amount,
          bonus
        },
        userId: driverId
      });
    }
    } catch (error) {
      return sendResponse(res, errors.internalError);
    }
  }

  async function transactionHistory(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const offset = (page - 1) * limit;
    const {id} = req.user.token;
    const {type} = req.body;
    let {rows} = await transactionModel.getAllByType({
      limit,
      offset,
      id,
      type,
    });
    res.status(200).json(rows);
  }

  async function wallet(req, res) {
    let data;
    const { id } = req.user.token;
    data = await transactionModel.getDriverBalance(id);
    res.status(200).json({
      wallet: data
    });
  }

  async function rechargeHistory(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const offset = (page - 1) * limit;
    try {
      const { startDate, endDate, type } = req.body;
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const { rows, count } = await transactionModel.getAllByTime({
        limit,
        offset,
        start,
        end,
        type,
      });
      res.status(200).json({
        data: rows,
        total: count,
      });
    } catch (error) {
      sendResponse(res, errors.internalError);
    }
  }

  async function creditSumInfos(req, res) {
    try {
      const {point, bonus, solde} = await transactionModel.getDriverBalance();
      res.status(200).json({
        bonus,
        point,
        solde
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
    creditSumInfos,
    incentiveBonus
  });
}
module.exports = getTransactionModule;
