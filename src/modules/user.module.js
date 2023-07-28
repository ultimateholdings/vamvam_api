/*jslint
node
*/
const {User} = require("../models");
const {propertiesPicker} = require("../utils/helpers");


function getUserModule({
    model
}) {
    const userModel = model || User;
    const genericProps = [
        "age",
        "avatar",
        "carInfos",
        "deviceToken",
        "firstName",
        "lastName",
        "password",
        "gender",
        "email"
    ];

    async function deleteAvatar(req, res) {
        let {id, phone} = req.user.token;
        const [updated] = await userModel.update({avatar: null}, {
            individualHooks: true,
            where: {id, phone}
        });
        res.status(200).json({updated});
    }

    function formatResponse ({avatar, carInfos, updatedProps, updated}) {
        let response;
        const responsePicker = propertiesPicker(updatedProps);
        const responseFields = genericProps.filter(
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

    async function getInformations(req, res) {
        const {id, phone} = req.user.token;
        let response;
        let result = await User.findOne({where: {id, phone}});
        response = genericProps.reduce(function (accumulator, prop) {
            accumulator[prop] = result[prop];
            return accumulator;
        }, Object.create(null));
        response.role = result.role;
        response.phoneNumber = phone;
        response.id = id;
        res.status(200).json(response);
    }

    async function updateProfile(req, res) {
        let {token: {id, phone}} = req.user;
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
        updatedProps = pickedProperties(genericProps);

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
                updatedProps,
                updated: updated > 0
            }));
        } else {
            res.status(400).json({
                message: "cannot update with invalid values"
            });
        }
    }

    return Object.freeze({
        deleteAvatar,
        getInformations,
        updateProfile
    });
}

module.exports = getUserModule;