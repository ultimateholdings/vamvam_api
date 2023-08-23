const {DataTypes, Op, col, fn, literal, where} = require("sequelize");
const {otpTypes} = require("../utils/config")

function define_OTP_request (connection) {
    
    const schema = {
        pinId: DataTypes.STRING,
        phone: {
            allowNull: false,
            primaryKey: true,
            type: DataTypes.STRING,
            unique: true
        },
        type: {
            defaultValue: otpTypes.authentication,
            type: DataTypes.ENUM,
            values: Object.values(otpTypes)
        }
    };
    const model = connection.define("otp_request", schema);
    model.types = otpTypes;
    model.canRequest = async function ({
        phone,
        ttlInSeconds,
        type = otpTypes.authentication
    }) {
        const clause = [
            where(fn(
                "TIMESTAMPDIFF",
                literal("SECOND"),
                col("createdAt"),
                fn("NOW")
            ), {[Op.lt]: ttlInSeconds}),
            {phone, type}
        ];
        let result = await this.findOne({where: {[Op.and]: clause}});
        return result === null;
    }
    return model;
}

module.exports = define_OTP_request;