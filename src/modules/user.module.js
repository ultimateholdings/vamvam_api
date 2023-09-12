/*jslint
node
*/
const {User} = require("../models");
const {
    isValidLocation,
    propertiesPicker,
    ressourcePaginator,
    sendResponse,
    toDbPoint
} = require("../utils/helpers");
const {
    apiRoles,
    errors
} = require("../utils/config");


function getUserModule({
    model
}) {
    const userModel = model || User;
    const userPagination = ressourcePaginator(userModel.getAll);

    async function ensureUserExists(req, res, next) {
        let {id, phone} = req.user.token;
        const userData = await userModel.findOne({where: {id, phone}});
        if (userData === null) {
            sendResponse(res, errors.notFound);
        } else {
            req.userData = userData;
            next();
        }
    }

    async function deleteAvatar(req, res) {
        let {id, phone} = req.user.token;
        const [updated] = await userModel.update({avatar: null}, {
            individualHooks: true,
            where: {id, phone}
        });
        res.status(200).json({updated: updated > 0});
    }

    async function ensureCanUpdateAvailability(req, res, next) {
        const {id} = req.user.token;
        const isDelivering = await userModel.hasOngoingDelivery(id);
        if (isDelivering) {
            return sendResponse(res, errors.cannotPerformAction);
        }
        next();
    }

    function formatResponse({avatar, carInfos, updated, updatedProps}) {
        let response;
        const responsePicker = propertiesPicker(updatedProps);
        const responseFields = userModel.genericProps.filter(
            (value) => value !== "avatar" && value !== "carInfos"
        );
        response = responsePicker(responseFields) || {};
        response.updated = updated;
        if (avatar.length > 0) {
            response.avatar = avatar[0].url;
        }
        if (carInfos.length > 0) {
            response.carInfos = carInfos[0].url;
        }
        return response;
    }

    function getInformations(req, res) {
        res.status(200).json(req.userData.toResponse());
    }

    async function getAllUsers(req, res) {
        let results;
        let {maxPageSize, role, skip} = req.query;
        const pageToken = req.headers["page-token"];
        const getParams = function (params) {
            if (apiRoles[role] !== undefined) {
                params.role = apiRoles[role];
            }
            return params;
        };
        maxPageSize = Number.parseInt(maxPageSize, 10);
        if (!Number.isFinite(maxPageSize)) {
            maxPageSize = 10;
        }
        skip = Number.parseInt(skip, 10);
        if (!Number.isFinite(skip)) {
            skip = undefined;
        }
        results = await userPagination({
            getParams,
            maxPageSize,
            pageToken,
            skip
        });
        res.status(200).json(results);
    }
    async function getNearByDrivers(req, res) {
        let {
            by,
            from,
            internal = true
        } = req.body;
        let drivers;
        if (!isValidLocation(from)) {
            return sendResponse(res, errors.invalidLocation);
        }
        if (!Number.isFinite(by)) {
            by = userModel.getSettings().search_radius;
        }
        if (typeof userModel.nearTo === "function") {
            drivers = await userModel.nearTo({
                by,
                params: {
                    available: true,
                    internal: Boolean(internal).valueOf(),
                    role: "driver"
                },
                point: toDbPoint(from)
            });
        } else {
            drivers = [];
        }

        res.status(200).send({
            result: drivers.map(function (driver) {
                const result = driver.toResponse();
                result.distance = driver.distance;
                return result;
            })
        });
    }

    async function updateAvailabilty(req, res) {
        let updated;
        const {available} = req.body;
        const {id, phone} = req.user.token;
        [updated] = await userModel.update({available}, {where: {id, phone}});
        res.status(200).json({updated: updated > 0});
    }

    async function updateProfile(req, res) {
        let {id, phone} = req.user.token;
        let {
            avatar = [],
            carInfos = []
        } = req.files || {};
        let updated;
        let updatedProps;
        const pickedProperties = propertiesPicker(req.body);
        if (avatar.length > 0) {
            req.body.avatar = avatar[0].path;
        }

        if (carInfos.length > 0) {
            req.body.carInfos = carInfos[0].path;
        }
        updatedProps = pickedProperties(userModel.genericProps);

        if (updatedProps !== undefined) {
            [updated] = await userModel.update(
                updatedProps,
                {
                    individualHooks: true,
                    where: {id, phone}
                }
            );
            res.status(200).json(formatResponse({
                avatar,
                carInfos,
                updated: updated > 0,
                updatedProps
            }));
        } else {
            sendResponse(res, errors.invalidUploadValues);
        }
    }

    return Object.freeze({
        deleteAvatar,
        ensureCanUpdateAvailability,
        ensureUserExists,
        getAllUsers,
        getInformations,
        getNearByDrivers,
        updateAvailabilty,
        updateProfile
    });
}

module.exports = getUserModule;