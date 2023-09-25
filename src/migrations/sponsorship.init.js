const {Sponsor, Sponsorship, connection} = require("../models");

function createTable(connection, model) {
    return connection.getQueryInterface().createTable(
        model.getTableName(),
        model.getAttributes()
    );
}

async function up() {
    await createTable(connection, Sponsor);
    await createTable(connection, Sponsorship);
}

async function down() {
    await connection.getQueryInterface().dropTable(Sponsor.getTableName());
    await connection.getQueryInterface().dropTable(Sponsorship.getTableName());
}

module.exports = {down, up};