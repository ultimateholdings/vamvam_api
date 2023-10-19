const {DataTypes, Transaction} = require("sequelize");

function defineBlackListModel(connection, userModel) {
    const globalId = "__global__identifier";
    const schema = {
        minimumIat: DataTypes.DATE,
        userId: {
            allowNull: false,
            type: DataTypes.UUID,
            unique: true,
        }
    };
    const blacklist = connection.define("blacklist", schema);

    userModel.invalidate = function (userId, minimumIat) {
        return blacklist.upsert({minimumIat, userId}, {
            fields: ["minimumIat"]
        });
    };
    userModel.invalidateAll = async function () {
        const transaction = new Transaction(connection, {
            isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE
        });
        try {
            await blacklist.truncate({transaction});
            await blacklist.upsert({
                minimumIat: new Date(),
                userId: globalId
            }, {
                fields: ["minimumIat"],
                transaction
            });
            await transaction.commit();
            return {success: true};
        } catch (error) {
            await transaction.rollback();
            return {error, success: false};
        }
    };
    blacklist.getGlobalIat = async function () {
        let reccord = await blacklist.findOne({where: {userId: globalId}});
        return reccord?.minimumIat;
    };
    blacklist.getUserIat = async function (userId) {
        let reccord = await blacklist.findOne({where: {userId}});
        return reccord?.minimumIat;
    };
    return blacklist;
}

module.exports = Object.freeze(defineBlackListModel);