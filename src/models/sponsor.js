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
    const sponsorshipSchema = {
        id: {
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            type: DataTypes.UUID
        }
    };
    const Sponsor = connection.define("sponsor", schema);
    const Sponsorship = connection.define("sponsorship", sponsorshipSchema);
    emitter.decorate(Sponsor);
    Sponsor.associate = function userAssociation(model, name) {
        const foreignKey = name + "Id";
        Sponsorship.belongsTo(Sponsor, {
            as: "sponsor",
            constraints: false,
            foreignKey: "sponsorId"
        });
        Sponsorship.belongsTo(model, {
            as: name,
            constraints: false,
            foreignKey
        });
        model.createSponsorship = function (sponsorId, modelId) {
            const data = {sponsorId};
            data[foreignKey] = modelId;
            return Sponsorship.create(data);
        };
        model.getSponsorByCode = function (code) {
            return Sponsor.findOne({where: {code}});
        };
    }
    return Object.freeze({Sponsor, Sponsorship});
}

module.exports = Object.freeze(defineSponsorModel);