/*jslint node this */
const {DataTypes, col, fn} = require("sequelize");
const {CustomEmitter} = require("../utils/helpers");

const initialQuery = function (offset, maxSize) {
    let query = {};
    if (offset > 0) {
        query.limit = maxSize + 1;
        query.offset = offset - 1;
    } else {
        query.limit = maxSize;
        query.offset = offset;
    }
    return query;
};

function defineSponsorModel({connection, model, name}) {
    const emitter = new CustomEmitter("Sponsor Emitter");
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
    model.handleSponsoringRequest = async function (code, memberId) {
        let where = {};
        let sponsoring;
        let sponsor = await Sponsor.findOne({where: {code}});
        where[foreignKey] = memberId;
        sponsoring = await Sponsorship.findOne({where});
        if (sponsor !== null && sponsoring === null) {
            where.sponsorId = sponsor.id;
            await Sponsorship.create(where);
        }
    };
    Sponsor.getRanking = async function ({maxSize, offset}) {
        let formerLastId;
        let results;
        const query = initialQuery(offset, maxSize);
        query.attributes = [
            "sponsorId",
            [fn("COUNT", col("sponsorId")), "totalUsers"]
        ];
        query.include = [
            {
                as: "sponsor",
                model: Sponsor,
                required: true
            }
        ];
        query.group = ["sponsorId"];
        query.order = [["totalUsers", "DESC"]];
        results = await Sponsorship.findAll(query);
        if (offset > 0) {
            formerLastId = results.shift();
            formerLastId = formerLastId?.dataValues?.sponsor?.id;
        }
        results = results.map(function (sponsorship) {
            const {sponsor, totalUsers} = sponsorship.dataValues;
            return {
                sponsor: sponsor.toResponse(),
                sponsored: totalUsers
            };
        });
        return {
            formerLastId,
            lastId: results.at(-1)?.sponsor?.id,
            values: results
        };
    };
    Sponsor.getEnrolled = async function ({
        id = null,
        maxSize,
        offset
    }) {
        let results;
        let formerLastId;
        const query = initialQuery(offset, maxSize);
        query.include = [
            {
                as: "sponsor",
                model: Sponsor,
                required: true,
                where: {id}
            },
            {
                as: name,
                model,
                required: true
            }
        ];
        query.order = [["createdAt", "DESC"]];
        results = await Sponsorship.findAll(query);
        if (offset > 0) {
            formerLastId = results.shift();
            formerLastId = formerLastId?.id;
        }
        results = results.map(function (sponsorship) {
            const result = sponsorship[name];
            return result.toShortResponse();
        });
        return {
            formerLastId,
            lastId: results.at(-1)?.id,
            values: results
        };
    };
    return Object.freeze({Sponsor, Sponsorship});
}

module.exports = Object.freeze(defineSponsorModel);