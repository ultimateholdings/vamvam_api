/*jslint node*/
const {DataTypes, Op, col, fn, literal, where} = require("sequelize");
const {apiSettings, dbSettings, otpTypes} = require("../utils/config");
const types = require("../utils/db-connector");
const {buildClause} = require("./helper");

function define_OTP_request(connection) {
    let settings = Object.entries(apiSettings.otp.defaultValues).reduce(
        function (acc, [key, val]) {
            acc[dbSettings[apiSettings.otp.value].options[key]] = val;
            return acc;
        },
        Object.create(null)
    );
    const schema = {
        phone: types.required(DataTypes.STRING).with({primaryKey: true}),
        pinId: types.required(DataTypes.STRING),
        type: types.enumType(otpTypes, otpTypes.authentication).with(
            {primaryKey: true}
        )
    };
    const model = connection.define("otp_request", schema);
    model.types = otpTypes;
    model.canRequest = async function ({
        phone,
        ttlInSeconds,
        type = otpTypes.authentication
    }) {
        let result;
        const clause = [
            where(fn(
                "TIMESTAMPDIFF",
                literal("SECOND"),
                col("updatedAt"),
                fn("NOW")
            ), buildClause(Op.lt, ttlInSeconds)),
            {phone, type}
        ];
        result = await this.findOne({where: buildClause(Op.and, clause)});
        return result === null;
    };
    model.getSettings = () => settings;
    model.setSettings = (data) => Object.entries(data).forEach(
        function ([key, val]) {
            settings[key] = val;
        }
    );
    return model;
}

module.exports = define_OTP_request;