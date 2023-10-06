/*jslint node this */
const {DataTypes, col, fn} = require("sequelize");
const {CustomEmitter} = require("../utils/helpers");
const {constraints, join, paginationQuery} = require("./helper");
const {required, uuidType} = require("../utils/db-connector");


function defineSponsorModel({connection, model, name}) {
    const emitter = new CustomEmitter("Sponsor Emitter");
    const schema = {
        code: required(DataTypes.STRING).with({unique: true}),
        id: uuidType(),
        name: DataTypes.STRING,
        phone: required(DataTypes.STRING).with({unique: true})
    };
    const sponsorshipSchema = {id: uuidType()};
    const Sponsor = connection.define("sponsor", schema);
    const Sponsorship = connection.define("sponsorship", sponsorshipSchema);
    const foreignKey = name + "Id";
    emitter.decorate(Sponsor);
    Sponsor.prototype.toResponse = function () {
        return this.dataValues;
    };
    Sponsorship.belongsTo(
        Sponsor,
        constraints("sponsorId", "sponsor").with({primaryKey: true})
    );
    Sponsorship.belongsTo(
        model,
        constraints(foreignKey, name).with({primaryKey: true})
    );
    model.handleSponsoringRequest = async function (memberId, code = null) {
        let where = {};
        let sponsor;
        let sponsoring;
        if (code === null) {
            return;
        }
        sponsor = await Sponsor.findOne({where: {code}});
        where[foreignKey] = memberId;
        sponsoring = await Sponsorship.findOne({where});
        if (sponsor !== null && sponsoring === null) {
            where.sponsorId = sponsor.id;
            await Sponsorship.create(where);
        }
    };
    model.prototype.getSponsorCode = async function () {
        let result;
        const {phone} = this.dataValues;
        const where = {phone};
        result = await Sponsor.findOne({where});
        return result?.code ?? null;
    }
    Sponsor.getRanking = async function ({maxSize, offset}) {
        let formerLastId;
        let results;
        const query = paginationQuery(offset, maxSize);
        query.attributes = [
            "sponsorId",
            [fn("COUNT", col("sponsorId")), "totalUsers"]
        ];
        query.include = join(Sponsor, "sponsor");
        query.group = ["sponsorId"];
        query.order = [["totalUsers", "DESC"]];
        results = await Sponsorship.findAll(query);
        if (offset > 0) {
            formerLastId = results.shift();
            formerLastId = formerLastId?.dataValues?.sponsor?.id;
        }
        results = results.map(function (sponsorship) {
            let {sponsor, totalUsers} = sponsorship.dataValues;
            const result = {sponsored: totalUsers};
            result.sponsor = sponsor.toResponse();
            return result;
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
        const query = paginationQuery(offset, maxSize);
        query.include = [
            join(Sponsor, "sponsor").with({where: {id}}),
            join(model, name)
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