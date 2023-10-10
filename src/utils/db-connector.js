/*jslint
node
*/
"use strict";
const {DataTypes, Sequelize} = require("sequelize");
const {getdbConfig} = require("./config.js");
const {mergableObject} = require("./helpers.js");

function sequelizeConnect({
    database,
    password = null,
    port,
    username
}) {
    let connection = new Sequelize(database, username, password, {
        dialect: "mariadb",
        host: "127.0.0.1",
        port
    });
    return connection;
}
function uuidType() {
    return {
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        type: DataTypes.UUID
    };
}

function enumType(initialValue, set) {
    let values = set;
    let defaultValue;
    const type = DataTypes.ENUM;
    if (!Array.isArray(set)) {
        values = Object.values(set);
    }
    if (typeof initialValue === "string") {
        defaultValue = initialValue;
    }
    return {defaultValue, type, values};
}

function required(type) {
    const result = Object.create(mergableObject);
    return result.with({
        allowNull: false,
        type: type ?? DataTypes.GEOMETRY("POINT")
    });
}

module.exports = Object.freeze({
    enumType,
    required,
    sequelizeConnection: (config = getdbConfig()) => sequelizeConnect(config),
    uuidType
});
