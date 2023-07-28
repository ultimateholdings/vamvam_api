/*jslint
node
*/
const {User} = require("../models");
const {propertiesPicker, sendResponse} = require("../utils/helpers");
const {errors} = require("../utils/config");


function getUserModule({
    model
}) {
    const userModel = model || User;

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
            response.avatar = "/uploads/" + avatar[0].basename;
        }
        if (carInfos.length > 0) {
            response.carInfos = "/uploads/" + carInfos[0].basename;
        }
        return response;
    }

    function getInformations(req, res) {
        res.status(200).json(req.userData.toResponse());
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
        getInformations,
        updateProfile
    });
}

module.exports = getUserModule;