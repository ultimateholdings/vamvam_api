const {DataTypes} = require("sequelize");

function definePayment (connection) {
    const schema = {
        transId: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        isVerify: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        id: {
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            type: DataTypes.UUID
        }
    };
    const payment = connection.define("payment", schema );
    return payment;
}

module.exports = definePayment;