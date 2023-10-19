/*jslint node*/
const {propertiesPicker,sendResponse} = require("../utils/helpers");
const {errors} = require("../utils/system-messages.js");
const {availableRoles} = require("../utils/config");


function getUserMiddleware(model) {
    const defaultGetter = function (body) {
        return {phone: body.phoneNumber};
    };
    const adminTypeMap = {
        registration: availableRoles.registrationManager,
        conflict: availableRoles.conflictManager
    };
    const adminCreationProps = ["phone", "password", "email"];
    const sponsorProps = ["phone", "name", "code"];
    async function ensureCanUpdateAvailability(req, res, next) {
        const {id} = req.user.token;
        const isDelivering = await model.hasOngoingDelivery(id);
        if (isDelivering) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        next();
    }
    async function ensureUserExists(req, res, next) {
        const {
            id = null,
            phone = null
        } = req.user.token;
        const userData = await model.findOne({where: {id, phone}});
        if (userData === null) {
            sendResponse(res, errors.nonexistingUser);
        } else {
            req.userData = userData;
            next();
        }
    }
    function lookupUser(propsGetter, requestProp = "user") {
        const getBodyProps = propsGetter ?? defaultGetter;
        return async function (req, ignore, next) {
            const user = await model.findOne({where: getBodyProps(req.body)});
            if (user !== null) {
                req[requestProp] = user;
            }
            next();
        };
    }

    function handlePendingRegistration(req, res, next) {
        const {user, registration} = req;
        if (user === undefined && registration !== undefined) {
            return sendResponse(res, errors.pendingRegistration);
        }
        next();
    }
    function validateAdminCreation(req, res, next) {
        let data;
        req.body.phone = req.body.phoneNumber;
        data = propertiesPicker(req.body)(adminCreationProps);
        if (adminTypeMap[req.body.type] === undefined) {
            return sendResponse(res, errors.unsupportedType);
        }
        if (Object.keys(data).length !== adminCreationProps.length) {
            return sendResponse(res, errors.invalidValues);
        }
        data.role = adminTypeMap[req.body.type];
        req.data = data;
        next();
    }
    async function validateSponsorCreation(req, res, next) {
        let exists;
        let data = propertiesPicker(req.body)(sponsorProps);
        if (Object.keys(data).length !== sponsorProps.length) {
            return sendResponse(res, errors.invalidValues);
        }
        exists = await model.sponsorExists(data.code);
        if (exists) {
            return sendResponse(res, errors.sponsorCodeExisting);
        }
        req.data = data;
        next();
    }
    return Object.freeze({
        ensureCanUpdateAvailability,
        ensureUserExists,
        handlePendingRegistration,
        lookupUser,
        validateAdminCreation,
        validateSponsorCreation
    });
}

module.exports = getUserMiddleware;