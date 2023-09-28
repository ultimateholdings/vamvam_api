const {Bundle, Delivery} = require("../models");
const {errors} = require("../utils/system-messages");
const {
  propertiesPicker,
  sendResponse,
} = require("../utils/helpers");
const minDeliveryPrice = 1000;
function getBundleModule({ model, deliveryModel }) {
  const BundleModel = model || Bundle;
  const deliveriesModel = deliveryModel || Delivery;
  const bundleProps = ["bonus", "point", "unitPrice"];
  
  async function ensureBundleExists(req, res, next) {
    const {id} = req.body;
    let bundle;
    if (typeof id !== "string" || id === "") {
      return sendResponse(res, errors.invalidValues);
    }
    bundle = await BundleModel?.findOne({ where: { id } });
    if (bundle === null) {
      return sendResponse(res, errors.notFound);
    }
    req.bundle = bundle;
    next();
  }
  async function createBundle(req, res) {
      let propertiesCreate;
      const pickedProperties = propertiesPicker(req.body);
      propertiesCreate = pickedProperties(bundleProps);
      if (propertiesCreate !== undefined) {
        await BundleModel.create({
          bonus: propertiesCreate.bonus,
          point: propertiesCreate.point,
          unitPrice: propertiesCreate.unitPrice,
        });
        res.status(200).json({});
      } else {
        sendResponse(res, errors.invalidValues);
      }
  }
  async function getBundleInfos(req, res) {
    let query;
    let bundle;
    const { id } = req.body;
    query = {
      attributes: [
        "bonus",
        "id",
        "point",
        "unitPrice"
      ],
      where: {
        id
      }
    }
    bundle = await BundleModel.findOne(query);
    if (bundle != null) {
      res.status(200).json({
        id: bundle.id,
        bonus: bundle.bonus,
        point: bundle.point,
        unitPrice: bundle.unitPrice,
        price: bundle.point * bundle.unitPrice,
        gainMin: bundle.point * minDeliveryPrice
      });
    } else {
      sendResponse(res, errors.notFound);
    }
  }
  async function getAllBundle(req, res) {
    try {
      let data;
      let bunchs;
      let query;
      query = {
        attributes: [
          "bonus",
          "id",
          "point",
          "unitPrice"
        ],
        order: [
          ['point', 'ASC']
        ]
      }
      bunchs = await BundleModel.findAll(query);
      data = bunchs.map(function(bunch){
        const {
          id,
          bonus,
          point,
          unitPrice
        } = bunch;
        return {
          id,
          bonus,
          point,
          unitPrice,
          price: point * unitPrice,
          gainMin: point * minDeliveryPrice
        }
      });
      res.status(200).json({ data });
    } catch (error) {
      sendResponse(res, errors.internalError);
    }
  }
  async function updateBunch(req, res) {
    let { id } = req.body;
    let updatedProps;
    const pickedProperties = propertiesPicker(req.body);
      updatedProps = pickedProperties(bundleProps);
      if (updatedProps !== undefined) {
        await BundleModel.update(updatedProps, {
          where: { id: id },
        });
        res.status(200).json({});
      } else {
        sendResponse(res, errors.invalidValues);
      }
  }
  async function deleteBunch(req, res) {
    const { id } = req.body;
    try {
      await BundleModel.destroy({
        where: { id: id },
      });
      res.status(204).send();
    } catch (error) {
      sendResponse(res, errors.internalError);
    }
  }
  return Object.freeze({
    createBundle,
    ensureBundleExists,
    getBundleInfos,
    getAllBundle,
    updateBunch,
    deleteBunch
  });
}
module.exports = getBundleModule;
