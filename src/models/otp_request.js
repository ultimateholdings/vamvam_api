const {DataTypes} = require("sequelize");

function define_OTP_request (connection) {
    const model = connection.define("otp_request", {
        pinId: DataTypes.STRING,
        phone: {
            allowNull: false,
            primaryKey: true,
            type: DataTypes.STRING,
            unique: true
        }
    });
    return model;
}

module.exports = define_OTP_request;