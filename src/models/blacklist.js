const {DataTypes} = require("sequelize");

function defineBlackListModel(connection) {
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

    blacklist.invalidateUser = function (userId, minimumIat) {
        return this.upsert({minimumIat, userId}, {
            fields: ["minimumIat"]
        });
    };
    blacklist.getGlobalIat = async function () {
        let reccord = await this.findOne({where: {userId: globalId}});
        return reccord?.minimumIat;
    }
    blacklist.getUserIat = async function (userId) {
        let reccord = await this.findOne({where: {userId}});
        return reccord?.minimumIat;
    }
    blacklist.globalId = globalId;
    return blacklist;
}

module.exports = Object.freeze(defineBlackListModel);