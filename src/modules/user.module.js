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
        "genre",
        "email",
        "password"
    ];

    async function deleteAvatar(req, res) {
        let {id, phone} = req.user.token;
        const [updated] = await userModel.update({avatar: null}, {
            individualHooks: true,
            where: {
                phone,
                userId: id
            }
        });
        res.status(200).json({updated});
    }

    async function getInformations(req, res) {
        const {id, phone} = req.user.token;
        let response;
        let result = await User.findOne({where: {phone, userId: id}});
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
        let propertiesUpdated;
        const pickedProperties = propertiesPicker(req.body);
        if (avatar.length > 0) {
            req.body.avatar = avatar[0].path;
        }

        if (carInfos.length > 0) {
            req.body.carInfos = carInfos[0].path;
        }
        propertiesUpdated = pickedProperties(genericProps);

        if (propertiesUpdated !== undefined) {
            [updated] = await userModel.update(
                propertiesUpdated,
                {
                    individualHooks: true,
                    where: {
                        phone,
                        userId: id
                    }
                }
            );
            res.status(200).json({updated});
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