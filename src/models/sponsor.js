/*jslint node this */
const {DataTypes, col, fn} = require("sequelize");
const {CustomEmitter} = require("../utils/helpers");
const {constraints, join, paginationQuery} = require("./helper");
const {required, uuidType} = require("../utils/db-connector");


function defineSponsorModel(connection, userModel) {
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
    const foreignKey = "userId";
    emitter.decorate(Sponsor);
    Sponsor.prototype.toResponse = function () {
        return this.dataValues;
    };
    Sponsorship.belongsTo(
        Sponsor,
        constraints("sponsorId", "sponsor").with({primaryKey: true})
    );
    Sponsorship.belongsTo(
        userModel,
        constraints(foreignKey, "user").with({primaryKey: true})
    );
    userModel.handleSponsoringRequest = async function (memberId, code = null) {
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
    userModel.prototype.getSponsorCode = async function () {
        let result;
        const {phone} = this.dataValues;
        const where = {phone};
        result = await Sponsor.findOne({where});
        return result?.code ?? null;
    };
    userModel.getRanking = async function ({maxSize, offset}) {
        let formerLastId;
        let results;
        let raw = `select count(\`sponsorId\`) as \`sponsored\`,
            ${Object.keys(schema).map((val) => `sponsors.\`${val}\``).join(",")}
            , sponsors.\`createdAt\`
            from sponsors left join sponsorships
            on sponsors.\`id\` = sponsorships.\`sponsorId\`
            group by \`sponsors\`.\`id\`
            order by \`sponsored\` desc limit ${offset}, ${maxSize};
        `;
        results = await connection.query(raw, {
            type: connection.QueryTypes.SELECT
        });
        if (offset > 0) {
            formerLastId = results.shift();
            formerLastId = formerLastId?.dataValues?.sponsor?.id;
        }
        results = results.map(function (row) {
            const sponsor = Object.assign({}, row);
            delete sponsor.sponsored;
            return {sponsor, sponsored: row.sponsored};
        });
        return {
            formerLastId,
            lastId: results.at(-1)?.sponsor?.id,
            values: results
        };
    };
    userModel.getEnrolled = async function ({
        id = null,
        maxSize,
        offset
    }) {
        let results;
        let formerLastId;
        const query = paginationQuery(offset, maxSize);
        query.include = [
            join(Sponsor, "sponsor").with({where: {id}}),
            join(userModel, "user")
        ];
        query.order = [["createdAt", "DESC"]];
        results = await Sponsorship.findAll(query);
        if (offset > 0) {
            formerLastId = results.shift();
            formerLastId = formerLastId?.id;
        }
        results = results.map(function (sponsorship) {
            const result = sponsorship.user;
            return result.toShortResponse();
        });
        return {
            formerLastId,
            lastId: results.at(-1)?.id,
            values: results
        };
    };
    userModel.sponsorExists = async function (code) {
        const result = await Sponsor.findOne({where: {code}});
        return result !== null;
    };
    userModel.createSponsor = (datas) => Sponsor.create(datas);
    return Object.freeze({Sponsor, Sponsorship});
}

module.exports = Object.freeze(defineSponsorModel);
