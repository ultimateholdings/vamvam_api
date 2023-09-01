/*jslint
node
*/
const {User} = require("../models");
const {
    isValidLocation,
    propertiesPicker,
    sendResponse,
    ressourcePaginator,
    toDbPoint
} = require("../utils/helpers");
const {
    apiRoles,
    errors,
    uploadsRoot
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

    function formatResponse({avatar, carInfos, updated, updatedProps}) {
        let response;
        const responsePicker = propertiesPicker(updatedProps);
        const responseFields = userModel.genericProps.filter(
            (value) => value !== "avatar" && value !== "carInfos"
        );
        response = responsePicker(responseFields) || {};
        response.updated = updated;
        if (avatar.length > 0) {
            response.avatar = uploadsRoot + avatar[0].basename;
        }
        if (carInfos.length > 0) {
            response.carInfos = uploadsRoot + carInfos[0].basename;
        }
        return response;
    }

    function getInformations(req, res) {
        res.status(200).json(req.userData.toResponse());
    }

    async function getAllUsers(req, res) {
        let results;
        let {role, index: pageIndex, maxPageSize} = req.query;
        const {page_token} = req.headers;
        const getParams = function (params) {
            if (apiRoles[role] !== undefined) {
                params.role = apiRoles[role];
            }
            return params;
        }
        maxPageSize = Number.parseInt(maxPageSize, 10);
        if (!Number.isFinite(maxPageSize)) {
            maxPageSize = 10;
        }
        pageIndex = Number.parseInt(pageIndex, 10);
        if (!Number.isFinite(pageIndex)) {
            pageIndex = undefined;
        }
        results = await userPagination({
            getParams,
            maxPageSize,
            pageIndex,
            pageToken: page_token,
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
            by = 55000;
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
        ensureUserExists,
        getAllUsers,
        getInformations,
        getNearByDrivers,
        updateProfile
    });
}

module.exports = getUserModule;