const { Bundle } = require("../models");
const { errors, availableRoles: roles } = require("../utils/config");
const {
  propertiesPicker,
  sendResponse,
  calculateSolde,
} = require("../utils/helpers");
const minDeliveryPrice = 1000;
function calculateGainMin(nb_point, minDeliveryPrice = 1000) {
  return nb_point * minDeliveryPrice;
}
function getBundleModule({ model }) {
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
    try {
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
    } catch (error) {
      sendResponse(res, errors.internalError);
    }
  }
  async function getBundleInfos(req, res) {
    let price;
    let gainMin;
    const { id } = req.body;
    const bundle = await BundleModel.findOne({
      where: {
        id: id,
      },
    });
    if (bundle != null) {
      price = calculateSolde(bundle.point, bundle.unitPrice);
      gainMin = calculateSolde(bundle.point, minDeliveryPrice);
      res.status(200).json({
        id: bundle.id,
        bonus: bundle.bonus,
        point: bundle.point,
        unitPrice: bundle.unitPrice,
        price: price,
        gainMin: gainMin,
      });
    } else {
      sendResponse(res, errors.notFound);
    }
  }
  async function getAllBundle(req, res) {
    try {
      let data;
      let bunchs;
      bunchs = await BundleModel.findAll({
        order: [
          ['point', 'ASC'],
      ],
      });
      data = bunchs?.map((bunch) => ({
        id: bunch.id,
        bonus: bunch.bonus,
        point: bunch.point,
        unitPrice: bunch.unitPrice,
        price: calculateSolde(bunch.point, bunch.unitPrice),
        gainMin: calculateGainMin(bunch.point, minDeliveryPrice),
      }));
      res.status(200).json({ data });
    } catch (error) {
      sendResponse(res, errors.internalError);
    }
  }
  async function updateBunch(req, res) {
    let { id } = req.body;
    let updated;
    let updatedProps;
    try {
      const pickedProperties = propertiesPicker(req.body);
      updatedProps = pickedProperties(bundleProps);
      if (updatedProps !== undefined) {
        updated = await BundleModel.update(updatedProps, {
          where: { id: id },
        });
        res.status(200).json({
          message: {
            en: "Bunch update successfully!",
            fr: "Forfait mise à jour avec succès!",
          },
        });
      } else {
        sendResponse(res, errors.invalidValues);
      }
    } catch (error) {
      sendResponse(res, errors.internalError);
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
    deleteBunch,
  });
}
module.exports = getBundleModule;
