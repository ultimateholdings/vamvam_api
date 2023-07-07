/*jslint
node
*/
const {User} = require("../models");
const {propertiesPicker} = require("../utils/helpers");


function getUserModule({
    model
}) {
    const userModel = model || User;
    const getGenericProps = [
        "avatar",
        "carInfos",
        "deviceToken",
        "firstName",
        "lastName",
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

    async function updateProfile(req, res) {
        let {id, phone} = req.user.token;
        let {
            avatar = [],
            carInfos = []
        } = req.files;
        let updated;
        let propertiesUpdated;
        const pickedProperties = propertiesPicker(req.body);
        if (avatar.length > 0) {
            req.body.avatar = avatar[0].path;
        }

        if (carInfos.length > 0) {
            req.body.carInfos = carInfos[0].path;
        }
        propertiesUpdated = pickedProperties(getGenericProps);

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
        updateProfile
    });
}

module.exports = getUserModule;