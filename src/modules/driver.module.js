/*jslint
node
*/
const {
    fileExists,
    parseParam,
    pathToURL,
    propertiesPicker,
    ressourcePaginator,
    sendResponse
} = require("../utils/helpers");
const {errors, eventMessages} = require("../utils/system-messages");
const {availableRoles, userStatuses} = require("../utils/config");
const {Registration, User} = require("../models");
const mailer = require("../utils/email-handler")();

function getRegistrationModule({model}) {
    const registrationModel = model || Registration;
    const paginateRegistrations = ressourcePaginator(registrationModel.getAll);
    const apiStatuses = {
        validated: userStatuses.activated,
        rejected: userStatuses.rejected,
    };

    async function registerDriver(req, res) {
        let admins;
        const {body} = req;
        let registration = await registrationModel.create(body, {
            individualHooks: true
        });
        res.status(200).json({registered: true});
        registrationModel.emitEvent(
            "new-registration",
            registration.toResponse()
        );
        admins = await registrationModel.getAdmins();
        admins.forEach(function (user) {
            mailer.notifyWithEmail({
                email: registration.email,
                notification: eventMessages.withTransfomedBody(
                    eventMessages.newDriverRegistration,
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
        let validation;
        const {body, driver} = req;
        body.internal = true;
        if (driver !== undefined) {
            return sendResponse(res, errors.existingUser);
        }
        body.phone = body.phoneNumber;
        validation = await registrationModel.addDriver(body);
        res.status(200).send({id: validation.value.id});
        await validation.requestSponsoring();
    }

    async function updateRegistration(req, res) {
        const {registration} = req;
        const requiredProps = registrationModel.requiredProps ?? [];
        let updated;
        let updates = req.body;
        updates.carInfos = req.file?.path;
        updates = propertiesPicker(updates)(requiredProps);
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
        const {registration} = req;
        let validation;
        registration.status = userStatuses.activated;
        await registration.save();
        validation = await registrationModel.addDriver(
            registration.toUserData()
        );
        res.status(200).send({userCreated: true});
        mailer.notifyWithEmail({
            email: registration.email,
            notification: eventMessages.withTransfomedBody(
                eventMessages.registrationValidated,
                (body) => body.replace("{userName}", registration.firstName)
            )[registration.lang ?? "en"]
        });
        await validation.requestSponsoring();
    }
    async function rejectRegistration(req, res) {
        const {registration} = req;
        registration.status = userStatuses.rejected;
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
        const {id} = req.user.token;
        const {maxPageSize, name, skip} = req.query;
        const pageToken = req.headers["page-token"];
        const getParams = function (params) {
            let result = Object.assign({}, params);
            result.contributorId = id;
            result.name = name;
            return result;
        };
        const registrations = await paginateRegistrations({
            getParams,
            maxPageSize,
            pageToken,
            skip
        });
        res.status(200).json(registrations);
    }

    async function getSettled(req, res) {
        const {id} = req.user.token;
        const {from, maxPageSize, name, skip, status, to} = req.query;
        const pageToken = req.headers["page-token"];
        const getParams = function (params) {
            const statuses = parseParam(
                status,
                (val) => apiStatuses[val]
            ).filter((val) => val !== undefined);

            params.name = name;
            params.from = from;
            params.to = to;
            params.contributorId = id;
            params.status = (
                statuses.length > 0
                ? statuses
                : Object.values(apiStatuses)
            );
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

    async function handleRegistration(req, res) {
        const {registration} = req;
        const {id} = req.user.token;
        registration.contributorId = id;
        await registration.save();
        res.status(200).json({});
    }

    return Object.freeze({
        getNewRegistrations,
        getSettled,
        handleRegistration,
        registerDriver,
        registerIntern,
        rejectRegistration,
        updateRegistration,
        validateRegistration
    });
}
module.exports = getRegistrationModule;
