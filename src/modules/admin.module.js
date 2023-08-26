/*jslint
node
*/
"use strict";
const {Blacklist, User} = require("../models");
const {
    availableRoles,
    defaultValues,
    errors,
    tokenTtl
} = require("../utils/config");
const {
    sendResponse
} = require("../utils/helpers");

function getAdminModule({associatedModels}) {
    const associations = associatedModels || {Blacklist, User};

    async function ensureUserExists(req, res, next) {
        const {id} = req.body;
        const user = await associations.User.findOne({where: {id}});
        if (user === null) {
            return sendResponse(res, errors.notFound);
        }
        req.requestedUser = user;
        next();
    }

    async function invalidateUser(req, res) {
        const {requestedUser} = req;
        const newDate = new Date();
        await associations.Blacklist.invalidateUser(
            requestedUser.id,
            newDate
        );
        res.status(200).json({invalidated: true});
    }
    async function invalidateEveryOne(_, res) {
        await associations.Blacklist.invalidateAll();
        res.status(200).json({invalidated: true});
    }

    return Object.freeze({
        ensureUserExists,
        invalidateEveryOne,
        invalidateUser,
    });
}

module.exports = Object.freeze(getAdminModule);

