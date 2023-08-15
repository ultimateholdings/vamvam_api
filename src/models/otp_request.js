const {DataTypes} = require("sequelize");

function define_OTP_request (connection) {
    const types = {
        authentication: "auth",
        reset: "reset",
    }
    const schema = {
        pinId: DataTypes.STRING,
        phone: {
            allowNull: false,
            primaryKey: true,
            type: DataTypes.STRING,
            unique: true
        },
        type: {
            defaultValue: "auth",
            type: DataTypes.ENUM,
            values: Object.values(types)
        }
    };
    const model = connection.define("otp_request", schema);
    model.types = types;
    return model;
}

module.exports = define_OTP_request;