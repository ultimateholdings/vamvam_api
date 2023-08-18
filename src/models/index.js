/*jslint
node
*/
const defineUserModel = require("./user.model.js");
const otpModel = require("./otp_request.js");
const defineDeliveryModel = require("./delivery.js");
const defineSubscriptionModel = require("./subscription.js");
const defineTransactionModel = require("./transaction.js");
const {sequelizeConnection} = require("../utils/db-connector.js");
const connection = sequelizeConnection();
const User = defineUserModel(connection);
const otpRequest = otpModel(connection);
const Delivery = defineDeliveryModel(connection);
const Subscription = defineSubscriptionModel(connection);
const Transaction = defineTransactionModel(connection);

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
    Subscription,
    Transaction,
    connection,
    otpRequest
});
