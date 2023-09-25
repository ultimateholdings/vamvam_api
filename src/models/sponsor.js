/*jslint node */
const {DataTypes} = require("sequelize");
const {CustomEmitter} = require("../utils/helpers");

function defineSponsorModel(connection) {
    const emitter = new CustomEmitter("Sponsor Emitter")
    const schema = {
        code: {
            allowNull: false,
            type: DataTypes.STRING,
            unique: true
        },
        id: {
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            type: DataTypes.UUID
        },
        name: DataTypes.STRING,
        phone: {
            allowNull: false,
            type: DataTypes.STRING,
            unique: true
        }
    };
    const sponsor = connection.define("sponsor", schema);
    emitter.decorate(sponsor);
    return sponsor;
}

module.exports = Object.freeze(defineSponsorModel);