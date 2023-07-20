/*jslint
node
*/
const defineUserModel = require("./user.model.js");
const otpModel = require("./otp_request.js");
const defineDeliveryModel = require("./delivery.js");
const {sequelizeConnection} = require("../utils/db-connector.js");
const connection = sequelizeConnection();
const User = defineUserModel(connection);
const otpRequest = otpModel(connection);
const Delivery = defineDeliveryModel(connection);

Delivery.belongsTo(User, {
    as: "Driver",
    constraints: false,
    foreignKey: {
        name: "driverId"
    }
});
Delivery.belongsTo(User, {
    as: "Client",
    constraints: false,
    foreignKey: {
        name: "clientId"
    }
});
module.exports = Object.freeze({
    Delivery,
    User,
    connection,
    otpRequest
});
