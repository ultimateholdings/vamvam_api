/*jslint
node
*/
const defineUserModel = require("./user.js");
const otpModel = require("./otp_request.js");
const defineDeliveryModel = require("./delivery.js");
const defineReportModel = require("./delivery-report.js");
const defineRegistration = require("./driver-registration.js");
const {sequelizeConnection} = require("../utils/db-connector.js");
const connection = sequelizeConnection();
const User = defineUserModel(connection);
const otpRequest = otpModel(connection);
const Delivery = defineDeliveryModel(connection);
const DeliveryConflict = defineReportModel(connection);
const Registration = defineRegistration(connection);

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
DeliveryConflict.belongsTo(User, {
    as: "Assigner",
    constraints: false,
    foreignKey: {
        name: "assignerId"
    }
});
DeliveryConflict.belongsTo(User, {
    as: "Reporter",
    constraints: false,
    foreignKey: {
        name: "reporterId"
    }
});
DeliveryConflict.belongsTo(Delivery, {
    as: "Delivery",
    constraints: false,
    foreignKey: {
        name: "deliveryId"
    }
});
DeliveryConflict.belongsTo(User, {
    as: "backupDriver",
    constraints: false,
    foreignKey: {
        name: "assigneeId"
    }
});
Registration.belongsTo(User, {
    as: "contributor",
    constraints: false,
    foreignKey: {
        name: "contributorId"
    }
});
module.exports = Object.freeze({
    Delivery,
    DeliveryConflict,
    Registration,
    User,
    connection,
    otpRequest
});
