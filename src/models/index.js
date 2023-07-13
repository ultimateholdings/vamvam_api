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
    foreignKey: {
        name: "driverId"
    },
    as: "Driver"
});
Delivery.belongsTo(User, {
    foreignKey: {
        name: "clientId"
    },
    as: "Client"
});
module.exports = Object.freeze({
    connection,
    Delivery,
    otpRequest,
    User
});
