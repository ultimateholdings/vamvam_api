/*jslint
node, nomen, this
*/
const {DataTypes} = require("sequelize");
const {staticPaymentProps} = require("../utils/config");
const {bundleStatuses} = require("../utils/config");

function defineBundleModel(connection) {
    const schema = {
        bonus: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        point: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        unitPrice: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        status: {
            defaultValue: bundleStatuses.activated,
            type: DataTypes.ENUM,
            values: Object.values(bundleStatuses)
        },
        id: {
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            type: DataTypes.UUID
        }
    };
    const bundle = connection.define("bundle", schema);
    bundle.buildBundlePayload = async function({amount, phoneNumber, lastName, firstName, email}) {
        let payload;
        payload = {
          phone_number: phoneNumber,
          amount: amount,
          email: email,
          fullname: lastName + " " + firstName,
          currency: staticPaymentProps.currency,
          country: staticPaymentProps.country,
          tx_ref: "transfer-" + Date.now()
        };
        return payload
    }
    bundle.changeBundleStatuse = async function({id, status}) {
        return await this.update({status}, {
            where: {id}
        });
    } 
    return bundle;
}
module.exports = defineBundleModel;