/*jslint node*/
const {
/*jslint-disable*/
    Op,
    col,
    fn,
    literal,
    where,
/*jslint-enable*/
    DataTypes
} = require("sequelize");
const {apiSettings, dbSettings, otpTypes} = require("../utils/config");

function define_OTP_request(connection) {
    let settings = Object.entries(apiSettings.otp.defaultValues).reduce(
        function (acc, [key, val]) {
            acc[dbSettings[apiSettings.otp.value].options[key]] = val;
            return acc;
        },
        Object.create(null)
    );
    const schema = {
        phone: {
            allowNull: false,
            type: DataTypes.STRING
        },
        pinId: {
            allowNull: false,
            primaryKey: true,
            type: DataTypes.STRING
        },
        type: {
            defaultValue: otpTypes.authentication,
            type: DataTypes.ENUM,
            values: Object.values(otpTypes)
        }
    };
    const model = connection.define("otp_request", schema);
    model.types = otpTypes;
/*jslint-disable*/
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
            ), {[Op.lt]: ttlInSeconds}),
            {phone, type}
        ];
        result = await this.findOne({where: {[Op.and]: clause}});
        return result === null;
    };
/*jslint-enable*/
    model.getSettings = () => settings;
    model.setSettings = (data) => Object.entries(data).forEach(
        function ([key, val]) {
            settings[key] = val;
        }
    );
    return model;
}

module.exports = define_OTP_request;