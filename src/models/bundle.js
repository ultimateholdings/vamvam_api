/*jslint
node, nomen, this
*/
const fs = require("fs");
const {DataTypes} = require("sequelize");

function defineBundleModel(connection) {
    const schema = {
        title: {
            type: DataTypes.STRING,
            allowNull: false
        },
        bonus: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        point: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        unitPrice: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        id: {
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            type: DataTypes.UUID
        }
    };
    const bundle = connection.define("bundle", schema)
    return bundle;
}

module.exports = defineBundleModel;