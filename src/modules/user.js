
const {User} = require("../models");

function getUserModule ({
    model
}) {
    const userModel = model || User;

    async function deleteAvatar (req, res) {
        let {user: {id, phone}} = req.body;
        const [updated] = await userModel.update({avatar: null}, {
            where: {
                phone,
                userId: id
            }
        });
        res.status(200).json({updated});
    }

    return Object.freeze({
        deleteAvatar
    });
}

module.exports = getUserModule;