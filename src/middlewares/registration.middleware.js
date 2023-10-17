/*jslint node*/
const {userStatuses} = require("../utils/config");
const {errors} = require("../utils/system-messages");
const {
    fileExists,
    propertiesPicker,
    sendResponse
} = require("../utils/helpers");

function getRegistrationMidleware(model) {

    async function ensureUnregistered(req, res, next) {
        const {phoneNumber} = req.body;
        const registration = await model.findOne(
            {where: {phoneNumber}}
        );
        if (registration !== null) {
            sendResponse(res, errors.alreadyRegistered);
        } else {
            next();
        }
    }

    function checkRegistration(propsGetter) {
        return async function (req, ignore, next) {
            const registration = await model.findOne(
                {where: propsGetter(req.body)}
            );
            if (registration !== null) {
                req.registration = registration;
            }
            next();
        };
    }

    async function ensureValidDatas(req, res, next) {
        const requiredDatas = model.requiredProps ?? [];
        let body;
        let hasFile;
        req.body.carInfos = req.file?.path;
        body = propertiesPicker(req.body)(requiredDatas);
        hasFile = await fileExists(body.carInfos);
        if (Object.keys(body).length !== requiredDatas.length || !hasFile) {
            sendResponse(res, errors.invalidValues);
        } else {
            req.body = body;
            next();
        }
    }

    async function ensureRegistrationExists(req, res, next) {
        const {id} = req.body;
        let registration;
        registration = await model.findOne({where: {id}});
        if (registration === null) {
            return sendResponse(res, errors.notFound);
        }
        req.registration = registration;
        next();
    }

    function ensureNotValidated(req, res, next) {
        const {registration} = req;
        if (registration.status === userStatuses.activated) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        next();
    }

    function ensureIsGranted(req, res, next) {
        const {id} = req.user.token;
        const {registration} = req;
        if (registration.contributorId !== id) {
            return sendResponse(res, errors.forbiddenAccess);
        }
        next();
    }

    function ensureNotHandled(req, res, next) {
        const {registration} = req;
        if (registration.contributorId !== null) {
            return sendResponse(res, errors.alreadyAssigned);
        }
        next();
    }
    return Object.freeze({
        checkRegistration,
        ensureIsGranted,
        ensureNotHandled,
        ensureNotValidated,
        ensureRegistrationExists,
        ensureUnregistered,
        ensureValidDatas
    });
}

module.exports = getRegistrationMidleware;