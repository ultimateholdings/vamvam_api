const {DataTypes} = require("sequelize");

function defineTransaction (connection) {
    const schema = {
        type: {
            type: DataTypes.ENUM,
            defaultValue: "recharge",
            values: ["recharge", "withdrawal"]
        },
        point: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        bonus: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        userId: {
            type: DataTypes.STRING,
            allowNull: false
        },
        unitPrice: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        id: {
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            type: DataTypes.UUID
        }
    };
    const transaction = connection.define("transaction", schema );
    return transaction;
}

module.exports = defineTransaction;