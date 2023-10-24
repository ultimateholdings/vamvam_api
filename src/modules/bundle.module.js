const {Bundle} = require("../models");
const {bundleStatuses} = require("../utils/config");
const {errors} = require("../utils/system-messages");
const {
  propertiesPicker,
  sendResponse,
} = require("../utils/helpers");
const minDeliveryPrice = 1000;
function getBundleModule({model}) {
  const BundleModel = model || Bundle;
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
      ],
      where: {
        status: bundleStatuses.activated
      }
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
        bonus: bonus * minDeliveryPrice,
        point,
        unitPrice,
        price: point * unitPrice,
        gainMin: point * minDeliveryPrice
      }
    });
    res.status(200).json({ data });
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
  async function changePackageStatus (req, res) {
    let result;
    const { id } = req.body;
    const status = bundleStatuses.inactive;
    result = await BundleModel.changeBundleStatuse({id, status});
    if (result.length !== 0) {
      res.status(200).send();
    }
  }
  return Object.freeze({
    createBundle,
    ensureBundleExists,
    getBundleInfos,
    getAllBundle,
    updateBunch,
    changePackageStatus
  });
}
module.exports = getBundleModule;