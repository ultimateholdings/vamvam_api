/*jslint node*/
const {Settings, connection} = require("../models");
const {apiSettings} = require("../utils/config");

const defaultSettings = Object.values(apiSettings).map(
    function settingMapper({value: type, defaultValues: value}) {
        return Object.freeze({type, value});
    }
);

function createTable(connection, model) {
    return connection.getQueryInterface().createTable(
        model.getTableName(),
        model.getAttributes()
    );
}

async function up() {
    await createTable(connection, Settings);
    await Settings.bulkCreate(defaultSettings);
}

async function down() {
    await connection.getQueryInterface().dropTable(Settings.getTableName());
}

module.exports = Object.freeze({down, up});