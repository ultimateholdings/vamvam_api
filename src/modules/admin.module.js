/*jslint
node
*/
"use strict";
const {Blacklist, Settings, User} = require("../models");
const {
    apiSettings,
    availableRoles,
    errors,
    userStatuses
} = require("../utils/config");
const {
    propertiesPicker,
    sendResponse
} = require("../utils/helpers");

function getAdminModule({associatedModels}) {
    const associations = associatedModels || {Blacklist, Settings, User};
    const adminTypeMap = {
        registration: availableRoles.registrationManager,
        conflict: availableRoles.conflictManager
    };

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
        requestedUser.status = userStatuses.inactive;
        await requestedUser.save();
        res.status(200).json({invalidated: true});
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

    return Object.freeze({
        activateUser,
        createNewAdmin,
        ensureUserExists,
        ensureValidSetting,
        getSettings,
        invalidateEveryOne,
        invalidateUser,
        logoutUser,
        updateSettings,
        validateAdminCreation
    });
}

module.exports = Object.freeze(getAdminModule);

