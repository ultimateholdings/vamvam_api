/*jslint node*/
const {DataTypes} = require("sequelize");

function defineSponsorshipModel(connection) {
    const schema = {
        id: {
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            type: DataTypes.UUID
        }
    };
    return connection.define("sponsorship", schema);
}

module.exports = Object.freeze(defineSponsorshipModel);