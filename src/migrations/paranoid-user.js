/*jslint node*/
const {DataTypes} = require("sequelize");
const {User, connection} = require("../models");
const queryInterface = connection.getQueryInterface();
function up() {
    return queryInterface.addColumn(User.getTableName(), "deletedAt", {
        type: DataTypes.DATE
    });
}

function down() {
    return queryInterface.removeColumn(User.getTableName(), "deletedAt");
}

module.exports = {down, up};