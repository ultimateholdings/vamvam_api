/*jslint
node
*/
const {
    fileExists,
    pathToURL,
    propertiesPicker,
    ressourcePaginator,
    sendResponse
} = require("../utils/helpers");
const {errors, eventMessages} = require("../utils/system-messages");
const {availableRoles, userStatuses} = require("../utils/config");
const {Registration, User} = require("../models");
const mailer = require("../utils/email-handler")();

function getRegistrationModule({associatedModels, model}) {
    const registrationModel = model || Registration;
    const associations = associatedModels || {User};
    const paginateRegistrations = ressourcePaginator(Registration.getAll);
    const apiStatuses = {
        pending: userStatuses.pendingValidation,
        rejected: userStatuses.rejected,
    };

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
        const {
            phoneNumber: phone
        } = req.body;
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
        let admins;
        const {body} = req;
        let registration = await registrationModel.create(body, {
            individualHooks: true
        });
        res.status(200).json({registered: true});
        registrationModel?.emitEvent(
            "new-registration",
            registration.toResponse()
        );
        admins = await associations.User.getWithRoles([
            availableRoles.registrationManager
        ]);
        admins.forEach(function (user) {
            mailer.notifyWithEmail({
                email: registration.email,
                notification: eventMessages.withTransfomedBody(
                    eventMessages.deliveryArchived,
                    (body) => body.replace(
                        "{userName}",
                        user.firstName
                    ).replace(
                        "{driverName}",
                        registration.firstName + " " + registration.lastName
                    )
                )[user.lang ?? "en"]
            });
        });
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
        let createdUser;
        registration.status = userStatuses.activated;
        registration.contributorId = id;
        await registration.save();
        createdUser = await associations.User.create(
            registration.toUserData(),
            {individualHooks: false}
        );
        res.status(200).send({userCreated: true});
        mailer.notifyWithEmail({
            email: registration.email,
            notification: eventMessages.withTransfomedBody(
                eventMessages.registrationValidated,
                (body) => body.replace("{userName}", registration.firstName)
            )[registration.lang ?? "en"]
        });
        await associations.User.handleSponsoringRequest(
            createdUser.id,
            registration.sponsorCode
        );
    }
    async function rejectRegistration(req, res) {
        const {id} = req.user.token;
        const {registration} = req;
        registration.status = userStatuses.rejected;
        registration.contributorId = id;
        await registration.save();
        res.status(200).send({rejected: true});
        mailer.notifyWithEmail({
            email: registration.email,
            notification: eventMessages.withTransfomedBody(
                eventMessages.registrationValidated,
                (body) => body.replace("{userName}", registration.firstName)
            )[registration.lang ?? "en"]
        });
    }

    async function getNewRegistrations(req, res) {
        const {maxPageSize, name, skip, status} = req.query;
        const pageToken = req.headers["page-token"];
        const getParams = function (params) {
            params.name = name;
            params.status = apiStatuses[status] ?? apiStatuses.pending;
            return params;
        };
        const registrations = await paginateRegistrations({
            getParams,
            maxPageSize,
            pageToken,
            skip
        });
        res.status(200).json(registrations);
    }
    
    async function getValidated(req, res) {
        const {from, maxPageSize, name, skip, to} = req.query;
        const pageToken = req.headers["page-token"];
        const getParams = function (params) {
            params.name = name;
            params.from = from;
            params.to = to;
            return params;
        };
        const registrations = await paginateRegistrations({
            getParams,
            maxPageSize,
            pageToken,
            skip
        });
        res.status(200).json(registrations);
    }

    return Object.freeze({
        ensureIsGranted,
        ensureRegistrationExists,
        ensureRegistrationPending,
        ensureUnregistered,
        ensureUserNotExists,
        ensureValidDatas,
        getNewRegistrations,
        getValidated,
        registerDriver,
        registerIntern,
        rejectRegistration,
        updateRegistration,
        validateRegistration
    });
}

module.exports = getRegistrationModule;