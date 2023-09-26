/*jslint
node, nomen, this
*/
const {DataTypes} = require("sequelize");
const {staticPaymentProps} = require("../utils/config");

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
    return bundle;
}

module.exports = defineBundleModel;