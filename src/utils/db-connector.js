/*jslint
node
*/
"use strict";
const  {Sequelize} = require("sequelize");
const {getdbConfig} = require("./config.js");

function sequelizeConnect({
    database,
    password = null,
    port,
    username,
}) {
    let connection = new Sequelize(database, username, password, {
        dialect: "mariadb",
        host: "127.0.0.1",
        port
    });
    return connection;
}

module.exports =  Object.freeze({
    sequelizeConnection: (config = getdbConfig()) => sequelizeConnect(config)
});
