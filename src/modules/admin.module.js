/*jslint
node
*/
"use strict";
const {Blacklist, User} = require("../models");
const {
    availableRoles,
    errors
} = require("../utils/config");
const {
    propertiesPicker,
    sendResponse
} = require("../utils/helpers");

function getAdminModule({associatedModels}) {
    const associations = associatedModels || {Blacklist, User};
    const adminTypeMap = {
        registration: availableRoles.registrationManager,
        conflict: availableRoles.conflictManager
    };

    async function ensureUserExists(req, res, next) {
        const {id} = req.body;
        const user = await associations.User.findOne({where: {id}});
        if (user === null) {
            return sendResponse(res, errors.notFound);
        }
        req.requestedUser = user;
        next();
    }
    
    function validateAdminCreation(req, res, next) {
        const requiredProps = ["phone", "password", "email"];
        let data;
        req.body.phone = req.body.phoneNumber;
        data = propertiesPicker(req.body)(requiredProps);
        if (adminTypeMap[req.body.type] === undefined) {
            return sendResponse(res, errors.unsupportedType);
        }
        if (Object.keys(data).length !== requiredProps.length) {
            return sendResponse(res, errors.invalidValues);
        }
        data.role = adminTypeMap[req.body.type];
        req.data = data;
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
    async function createNewAdmin(req, res) {
        const {data} = req;
        const newAdmin = await associations.User.create(data);
        res.status(200).json({id: newAdmin.id});
    }

    return Object.freeze({
        createNewAdmin,
        ensureUserExists,
        invalidateEveryOne,
        invalidateUser,
        validateAdminCreation
    });
}

module.exports = Object.freeze(getAdminModule);

