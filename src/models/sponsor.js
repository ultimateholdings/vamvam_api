/*jslint node */
const {DataTypes, col, fn} = require("sequelize");
const {CustomEmitter} = require("../utils/helpers");

function defineSponsorModel({connection, model, name}) {
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
    const foreignKey = name + "Id";
    emitter.decorate(Sponsor);
    Sponsor.prototype.toResponse = function () {
        return this.dataValues;
    };
    Sponsorship.belongsTo(Sponsor, {
        as: "sponsor",
        constraints: false,
        foreignKey: "sponsorId",
        primaryKey: true
    });
    Sponsorship.belongsTo(model, {
        as: name,
        constraints: false,
        foreignKey,
        primaryKey: true
    });
    model.createSponsorship = function (sponsorId, modelId) {
        const data = {sponsorId};
        data[foreignKey] = modelId;
        return Sponsorship.upsert(data);
    };
    model.getSponsorByCode = function (code) {
        return Sponsor.findOne({where: {code}});
    };
    Sponsor.getRanking = async function ({maxSize, offset}) {
        let formerLastId;
        let results;
        const query = {
            attributes: [
                "sponsorId",
                [fn("COUNT", col("sponsorId")), "totalUsers"]
            ],
            group: ["sponsorId"],
            include: [
                {
                    as: "sponsor",
                    model: Sponsor,
                    required: true
                }
            ],
            limit: (offset > 0 ? maxSize + 1: maxSize),
            offset: (offset > 0 ? offset - 1: offset),
            order: [["totalUsers", "DESC"]]
        };
        results = await Sponsorship.findAll(query);
        if (offset > 0) {
            formerLastId = results.shift();
            formerLastId = formerLastId?.sponsor?.id;
        }
        results = results.map(function (sponsorship) {
            const {sponsor, totalUsers} = sponsorship.dataValues;
            return {
                sponsored: totalUsers,
                sponsor: sponsor.toResponse()
            };
        });
        return {
            formerLastId,
            lastId: results.at(-1)?.sponsor?.id,
            values: results
        };
    };
    return Object.freeze({Sponsor, Sponsorship});
}

module.exports = Object.freeze(defineSponsorModel);