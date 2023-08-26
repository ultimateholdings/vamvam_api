/*jslint
node
*/
const defineUserModel = require("./user.model.js");
const otpModel = require("./otp_request.js");
const defineDeliveryModel = require("./delivery.js");
const defineSubscriptionModel = require("./subscription.js");
const defineTransactionModel = require("./transaction.js");
const definePaymentModel = require("./payment.js");
const {sequelizeConnection} = require("../utils/db-connector.js");
const connection = sequelizeConnection();
const User = defineUserModel(connection);
const otpRequest = otpModel(connection);
const Delivery = defineDeliveryModel(connection);
const Subscription = defineSubscriptionModel(connection);
const Transaction = defineTransactionModel(connection);
const Payment = definePaymentModel(connection);

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
Subscription.hasOne(Payment, {
    as: "Pack",
    constraints: false,
    foreignKey:{
        name: 'packId'
    } 
})
User.hasOne(Payment, {
    as: "Customer",
    constraints: false,
    foreignKey:{
        name: 'customerId'
    } 
})
module.exports = Object.freeze({
    Delivery,
    User,
    Subscription,
    Transaction,
    Payment,
    connection,
    otpRequest
});
