const { Subscription } = require("../models");
const { errors, availableRoles: roles } = require("../utils/config");
const { propertiesPicker, sendResponse } = require("../utils/helpers");
function calculatePrice(nb_point, unitPrice) {
  return nb_point * unitPrice;
}
function calculateGainMin(nb_point, minDeliveryPrice = 1000) {
  return nb_point * minDeliveryPrice;
}
function getSubscriptionModule({ model }) {
  const SubscriptionModel = model || Subscription;
  const subscriptionProps = ["title", "bonus", "point", "unitPrice"];
  function canAccessToSubscription(req, res, next) {
    const { role } = req.user.token;
    const isAdmin = role === roles.admin;
    if (isAdmin) {
      next();
    } else {
      sendResponse(res, errors.notAuthorized);
    }
  }
  async function ensureSubscriptionExists(req, res, next) {
    const { id } = req.body;
    const subscription = await SubscriptionModel?.findOne({ where: { id } });
    if (subscription === null) {
      return sendResponse(res, errors.notFound);
    }
    req.subscription = subscription;
    next();
  }
  async function createSubscription(req, res) {
    try {
      let price;
      let gainMin;
      let propertiesCreate;
      const pickedProperties = propertiesPicker(req.body);
      propertiesCreate = pickedProperties(subscriptionProps);
      if (propertiesCreate !== undefined) {
        price = calculatePrice(
          propertiesCreate.point,
          propertiesCreate.unitPrice
        );
        gainMin = calculateGainMin(propertiesCreate.point);
        const subscription = await SubscriptionModel.create({
          title: propertiesCreate.title,
          bonus: propertiesCreate.bonus,
          point: propertiesCreate.point,
          unitPrice: propertiesCreate.unitPrice
        });
        const data = {
          subscriptionId: subscription.id,
          title: subscription.title,
          bonus: subscription.bonus,
          point: subscription.point,
          unitPrice: subscription.unitPrice,
          price: price,
          gainMin: gainMin,
        };
        res.status(200).json({
          succes: true,
          data: data,
        });
      } else {
        sendResponse(res, errors.invalidValues);
      }
    } catch (error) {
      sendResponse(res, errors.internalError);
    }
  }
  async function getSubscriptionInfos(req, res) {
    let price;
    let gainMin;
    const { subscriptionId } = req.body;
    try {
      const subscription = await SubscriptionModel.findOne({
        where: {
          id: subscriptionId,
        },
      });
      if (subscription != null) {
        price = calculatePrice(
          subscription.point,
          subscription.unitPrice
        );
        gainMin = calculateGainMin(subscription.point);
        res.status(200).json({
          subscriptionId: subscription.id,
          title: subscription.title,
          bonus: subscription.bonus,
          point: subscription.point,
          unitPrice: subscription.unitPrice,
          price: price,
          gainMin: gainMin,
        });
      }
    } catch (error) {
      sendResponse(res, errors.internalError);
    }
  }
  async function getBunchs(req, res) {
    try {
      let data;
      let bunchs;
      bunchs = await SubscriptionModel.findAll();
      if (bunchs != null) {
        data = bunchs?.map((bunch) => ({
          subscriptionId: bunch.id,
          title: bunch.title,
          bonus: bunch.bonus,
          point: bunch.point,
          unitPrice: bunch.unitPrice,
          price: calculatePrice(
            bunch.point,
            bunch.unitPrice
          ),
          gainMin: calculateGainMin(bunch.point),
        }));
        res.status(200).json({
          succes: true,
          message: "Bunch return with succesfully!",
          data: data,
        });
      } else {
        res.status(404).json({
          succes: false,
          message: "Bunch not found!",
        });
      }
    } catch (error) {
      sendResponse(res, errors.internalError);
    }
  }
  async function updateBunch(req, res) {
    let { subscriptionId } = req.body;
    let updated;
    let updatedProps;
    try {
      const pickedProperties = propertiesPicker(req.body);
      updatedProps = pickedProperties(subscriptionProps);
      if (updatedProps !== undefined) {
        updated = await SubscriptionModel.update(updatedProps, {
          where: { id: subscriptionId },
        });
        res.status(200).json({
          succes: true,
          message: "Bunch update successfully!",
        });
      } else {
        sendResponse(res, errors.invalidValues);
      }
    } catch (error) {
      sendResponse(res, errors.internalError);
    }
  }
  async function deleteBunch(req, res) {
    const { subscriptionId } = req.body;
    try {
      await SubscriptionModel.destroy({
        where: { id: subscriptionId }
      });
      res.status(204).send();
    } catch (error) {
      sendResponse(res, errors.internalError);
    }
  }
  return Object.freeze({
    canAccessToSubscription,
    createSubscription,
    ensureSubscriptionExists,
    getSubscriptionInfos,
    getBunchs,
    updateBunch,
    deleteBunch
  });
}
module.exports = getSubscriptionModule;