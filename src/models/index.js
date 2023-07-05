/*jslint
node
*/
const defineUserModel = require("./user.model.js");
const {sequelizeConnection} = require("../utils/db-connector.js");
const connection = sequelizeConnection();
const models = {
    User: defineUserModel(connection),
    connection
};

module.exports = Object.freeze(models);
