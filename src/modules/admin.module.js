/*jslint
node
*/
"use strict";
const {Blacklist, Settings, Sponsor, User} = require("../models");
const {errors} = require("../utils/system-messages");
const {
    apiSettings,
    availableRoles,
    userStatuses
} = require("../utils/config");
const {
    propertiesPicker,
    sendResponse
} = require("../utils/helpers");

function getAdminModule({associatedModels}) {
    const associations = associatedModels || {Blacklist, Settings, Sponsor, User};
    const adminTypeMap = {
        registration: availableRoles.registrationManager,
        conflict: availableRoles.conflictManager
    };
    const sponsorProps = ["phone", "name", "code"];
    const adminCreationProps = ["phone", "password", "email"];

    function ensureValidSetting(req, res, next) {
        let setting = {};
        let parsedValues;
        const {type, value} = req.body;
        if (apiSettings[type] === undefined) {
            return sendResponse(res, errors.unsupportedType);
        }
        setting.type = apiSettings[type].value;
        setting.value = {};
        parsedValues = propertiesPicker(value)(Object.keys(apiSettings[type].options));
        if (parsedValues === undefined) {
            return sendResponse(res, errors.invalidValues);
        }
        Object.entries(parsedValues).forEach(function ([key, val]) {
            setting.value[apiSettings[type].options[key]] = val;
        });
        req.setting = setting;
        next();
    }

    async function sponsorCodeValid(code) {
        let codeExists = await Sponsor.findOne({where: {code}});
        return Object.freeze({exists: codeExists !== null});
    }

    async function ensureUserExists(req, res, next) {
        const {id} = req.body;
        let user;
        if (typeof id !== "string" || id === "") {
            return sendResponse(res, errors.invalidValues);
        }
        user = await associations.User.findOne({where: {id}});
        if (user === null) {
            return sendResponse(res, errors.notFound);
        }
        req.requestedUser = user;
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

    function validateSponsorCreation(req, res, next) {
        let data = propertiesPicker(req.body)(sponsorProps);
        if (Object.keys(data).length !== sponsorProps.length) {
            return sendResponse(res, errors.invalidValues);
        }
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
        requestedUser.status = userStatuses.inactive;
        await requestedUser.save();
        res.status(200).json({invalidated: true});
        associations.Settings.emitEvent("user-revocation-requested", {
            userId: requestedUser.id
        });
    }

    async function logoutUser(req, res) {
        const {id} = req.user.token;
        const newDate = new Date();
        await associations.Blacklist.invalidateUser(
            id,
            newDate
        );
        res.status(200).json();
    }

    async function activateUser(req, res) {
        const {requestedUser} = req;
        requestedUser.status = userStatuses.activated;
        await requestedUser.save();
        res.status(200).json({activated: true});
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

    async function updateSettings(req, res) {
        const setting = req.setting;
        const [updated] = await associations.Settings.updateSettings(setting);
        res.status(200).json({updated: updated > 0});
        associations.Settings.emitEvent("settings-update", req.body);
    }

    async function getSettings(req, res) {
        let response;
        let {type} = req.query;
        if (apiSettings[type] === undefined && typeof type === "string") {
            return sendResponse(res, errors.unsupportedType);
        }
        response = await associations.Settings.getAll(apiSettings[type]?.value);
        if (response.length === 1) {
            response = response[0];
        }
        res.status(200).json({settings: response});
    }

    async function createSponsor(req, res) {
        const {data} = req;
        const code = await sponsorCodeValid(data.code);
        if (code.exists) {
            return sendResponse(res, errors.alreadyAssigned)
        }
        await Sponsor.create(data);
        res.status(200).json({created: true});
    }

    return Object.freeze({
        activateUser,
        createNewAdmin,
        createSponsor,
        ensureUserExists,
        ensureValidSetting,
        getSettings,
        invalidateEveryOne,
        invalidateUser,
        logoutUser,
        sponsorCodeValid,
        updateSettings,
        validateAdminCreation,
        validateSponsorCreation
    });
}

module.exports = Object.freeze(getAdminModule);

