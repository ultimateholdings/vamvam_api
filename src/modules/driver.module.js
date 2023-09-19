/*jslint
node
*/
const path = require("node:path");
const {
    fileExists,
    pathToURL,
    propertiesPicker,
    sendResponse
} = require("../utils/helpers");
const {
    errors,
    userStatuses
} = require("../utils/config");
const {Registration, User} = require("../models");

function getRegistrationModule({associatedModels, model}) {
    const registrationModel = model || Registration;
    const associations = associatedModels || {User};

    async function ensureValidDatas(req, res, next) {
        const requiredDatas = registrationModel.requiredProps ?? [];
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
        if (typeof id !== "string" || id === "") {
            return sendResponse(res, errors.invalidValues);
        }
        registration = await registrationModel.findOne({where: {id}});
        if (registration === null) {
            return sendResponse(res, errors.notFound);
        }
        req.registration = registration;
        next();
    }

    function ensureRegistrationPending(req, res, next) {
        const {registration} = req;
        if (registration.status !== userStatuses.pendingValidation) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        next();
    }

    function ensureIsGranted(req, res, next) {
        const {id} = req.user.token;
        const {registration} = req;
        if ((registration.validatorId ?? id) !== id) {
            return sendResponse(res, errors.forbiddenAccess);
        }
        next();
    }

    async function ensureUserNotExists(req, res, next) {
        const {phoneNumber: phone} = req.body;
        let user;
        if (typeof phone !== "string" || phone === "") {
            return sendResponse(res, errors.invalidValues);
        }
        user = await associations.User.findOne({where: {phone}});
        if (user !== null) {
            return sendResponse(res, errors.existingUser);
        }
        req.body.phone = phone;
        next();
    }

    async function ensureUnregistered(req, res, next) {
        const {phoneNumber} = req.body;
        const registration = await registrationModel.findOne(
            {where: {phoneNumber}}
        );
        const user = await associations.User.findOne({
            where: {phone: phoneNumber}
        });
        if (user !== null) {
            return sendResponse(res, errors.existingUser);
        }
        if (registration !== null) {
            sendResponse(res, errors.alreadyRegistered);
        } else {
            next();
        }
    }

    async function registerDriver(req, res) {
        const {body} = req;
        let registration = await registrationModel.create(body, {
            individualHooks: true
        });
        res.status(200).json({registered: true});
        registrationModel?.emitEvent(
            "new-registration",
            registration.toResponse()
        );
    }

    async function registerIntern(req, res) {
        const {body} = req;
        body.internal = true;
        const user = await associations.User.create(body, {
            individualHooks: true
        });
        res.status(200).send({id: user.id});
    }

    async function updateRegistration(req, res) {
        const {id} = req.user.token;
        const {registration} = req;
        const requiredProps = registrationModel.requiredProps ?? [];
        let updated;
        let updates = req.body;
        updates.carInfos = req.file?.path;
        updates = propertiesPicker(updates)(requiredProps);
        updates.contributorId = id;
        if (Object.keys(updates).length <= 0) {
            return sendResponse(res, errors.invalidValues);
        }
        [updated] = await registrationModel.update(
            updates,
            {where: {id: registration.id}}
        );
        if (updates.carInfos !== undefined) {
            updates.carInfos = pathToURL(updates.carInfos);
        }
        updates.updated = updated > 0;
        res.status(200).send(updates);
    }

    async function validateRegistration(req, res) {
        const {id} = req.user.token;
        const {registration} = req;
        registration.status = userStatuses.activated;
        registration.contributorId = id;
        await registration.save();
        await associations.User.create(registration.toUserData(), {
            individualHooks: false
        });
        res.status(200).send({userCreated: true});
        //TODO: add the notification logic
    }
    async function rejectRegistration(req, res) {
        const {id} = req.user.token;
        const {registration} = req;
        registration.status = userStatuses.rejected;
        registration.contributorId = id;
        await registration.save();
        res.status(200).send({rejected: true});
        //TODO: add the notification logic
    }

    return Object.freeze({
        ensureIsGranted,
        ensureRegistrationExists,
        ensureRegistrationPending,
        ensureUnregistered,
        ensureUserNotExists,
        ensureValidDatas,
        registerDriver,
        registerIntern,
        rejectRegistration,
        updateRegistration,
        validateRegistration
    });
}

module.exports = getRegistrationModule;