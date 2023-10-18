/*jslint node*/
const {sendResponse} = require("../utils/helpers");
const {errors} = require("../utils/system-messages.js");


function getUserMiddleware(model) {
    const defaultGetter = function (body) {
        return {phone: body.phoneNumber};
    };
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
    return Object.freeze({
        ensureCanUpdateAvailability,
        ensureUserExists,
        handlePendingRegistration,
        lookupUser
    });
}

module.exports = getUserMiddleware;