/*jslint
node
*/
const {Delivery, User, connection, otpRequest} = require("../models");

async function createTable (connection, model) {
    await connection.getQueryInterface().createTable(
        model.getTableName(),
        model.getAttributes()
    );
}

async function up() {
    await createTable(connection, otpRequest);
    await createTable(connection, User);
    await createTable(connection, Delivery);
    
}

async function down() {
    await connection.getQueryInterface().dropTable(otpRequest.getTableName());
    await connection.getQueryInterface().dropTable(User.getTableName());
    await connection.getQueryInterface().dropTable(Delivery.getTableName());
}

module.exports = Object.freeze({down, up});