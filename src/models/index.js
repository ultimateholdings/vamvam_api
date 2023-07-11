/*jslint
node
*/
const defineUserModel = require("./user.model.js");
const otpModel = require("./otp_request.js");
const {sequelizeConnection} = require("../utils/db-connector.js");
const connection = sequelizeConnection();
const models = {
    otpRequest: otpModel(connection),
    User: defineUserModel(connection),
    connection
};

module.exports = Object.freeze(models);
