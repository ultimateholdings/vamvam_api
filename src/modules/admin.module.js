/*jslint node*/
"use strict";
const {Settings, User} = require("../models");
const {errors} = require("../utils/system-messages");
const {apiSettings, userStatuses} = require("../utils/config");
const {
    propertiesPicker,
    ressourcePaginator,
    sendResponse
} = require("../utils/helpers");

function getAdminModule({associatedModels}) {
    const associations = associatedModels || {Settings, User};
    const rankingPagination = ressourcePaginator(User.getRanking);
    const mentoringPagination = ressourcePaginator(User.getEnrolled);

    function ensureValidSetting(req, res, next) {
        let setting = {};
        let parsedValues;
        const {type, value} = req.body;
        if (apiSettings[type] === undefined) {
            return sendResponse(res, errors.unsupportedType);
        }
        setting.type = apiSettings[type].value;
        parsedValues = propertiesPicker(value)(Object.keys(apiSettings[type].options));
        if (parsedValues === undefined) {
            return sendResponse(res, errors.invalidValues);
        }
        setting.value =  Object.entries(parsedValues).reduce(
            function (acc, [key, val]) {
                acc[apiSettings[type].options[key]] = val;
                return acc;
            },
            {});
        req.setting = setting;
        next();
    }

    async function invalidateUser(req, res) {
        const {requestedUser} = req;
        const newDate = new Date();
        if (requestedUser === undefined) {
            return sendResponse(res, errors.nonexistingUser);
        }
        await associations.User.invalidate(
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
        await associations.User.invalidate(id, newDate);
        res.status(200).json();
    }

    async function activateUser(req, res) {
        const {requestedUser} = req;
        if (requestedUser === undefined) {
            return sendResponse(res, errors.nonexistingUser);
        }
        requestedUser.status = userStatuses.activated;
        await requestedUser.save();
        res.status(200).json({activated: true});
    }

    async function invalidateEveryOne(_, res) {
        await associations.User.invalidateAll();
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
        await associations.User.createSponsor(data);
        res.status(200).json({created: true});
    }

    async function getSponsorRanking(req, res) {
        let results;
        const {maxPageSize, skip} = req.query;
        const pageToken = req.headers["page-token"];
        results = await rankingPagination({maxPageSize, skip, pageToken});
        res.status(200).json(results);
    }

    async function getMentoredUsers(req, res) {
        let results;
        const {id, maxPageSize, skip} = req.query;
        const pageToken = req.headers["page-token"];
        const getParams = function (params) {
            if (typeof id === "string" && id.trim().length > 0) {
                params.id = id.trim();
            }
            return params;
        };
        results = await mentoringPagination({
            getParams,
            maxPageSize,
            pageToken,
            skip
        });
        res.status(200).json(results);
    }

    return Object.freeze({
        activateUser,
        createNewAdmin,
        createSponsor,
        ensureValidSetting,
        getMentoredUsers,
        getSettings,
        getSponsorRanking,
        invalidateEveryOne,
        invalidateUser,
        logoutUser,
        updateSettings
    });
}

module.exports = Object.freeze(getAdminModule);
