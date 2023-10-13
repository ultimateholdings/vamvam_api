/*jslint node this*/
const {DataTypes, Op, col, fn, where} = require("sequelize");
const {ages, userStatuses} = require("../utils/config");
const {
    CustomEmitter,
    hashPassword,
    pathToURL,
    propertiesPicker
} = require("../utils/helpers");
const {buildClause, buildPeriodQuery, paginationQuery} = require("./helper");
const types = require("../utils/db-connector");

const order = [["createdAt", "DESC"]];

const schema = {
    age: types.enumType(ages).with({allowNull: false}),
    carInfos: DataTypes.STRING,
    email: {
        type: DataTypes.STRING,
        unique: true,
        validate: {isEmail: true}
    },
    firstName: DataTypes.STRING,
    gender: types.enumType(["F", "M"], "M"),
    id: types.uuidType(),
    lang: DataTypes.STRING,
    lastName: DataTypes.STRING,
    password: DataTypes.STRING,
    phoneNumber: types.required(DataTypes.STRING).with({unique: true}),
    sponsorCode: DataTypes.STRING,
    status: types.enumType(userStatuses, userStatuses.pendingValidation)
};
function defineDriverRegistration(connection) {
    const emitter = new CustomEmitter("Registration emitter");
    const registration = connection.define("driver_registration", schema, {
        hooks: {
            beforeCreate: async function (record) {
                let {password} = record.dataValues;
                let hash;
                if (password !== undefined && password !== null) {
                    hash = await hashPassword(password);
                    record.dataValues.password = hash;
                }
            }
        }
    });
    const optionalProps = [
        "id",
        "sponsorCode",
        "lang",
        "validationDate",
        "status"
    ];
    const requiredProps = Object.keys(schema).filter(
        (key) => !optionalProps.includes(key)
    );
    registration.prototype.toResponse = function () {
        let result = this.dataValues;
        let props = requiredProps.concat("status", "id", "createdAt");
        result = propertiesPicker(result)(props);
        result.registrationDate = result.createdAt.toISOString();
        result.carInfos = pathToURL(result.carInfos);
        delete result.createdAt;
        delete result.password;
        return result;
    };

    registration.prototype.toUserData = function () {
        let result = this.dataValues;
        result = propertiesPicker(result)(requiredProps);
        result.phone = result.phoneNumber;
        delete result.phoneNumber;
        return result;
    };
    registration.requiredProps = requiredProps;
    registration.getAll = async function ({
        contributorId,
        from,
        maxSize,
        name,
        offset,
        status,
        to
    }) {
        let formerLastId;
        let results;
        const clause = {};
        const query = paginationQuery(offset, maxSize);
        query.order = order;
        query.where = {};
        query.where[Op.and] = [
            buildPeriodQuery(from, to, "updatedAt"),
            buildClause(
                "contributorId",
                buildClause(Op.eq, contributorId ?? null)
            )
        ];
        if (typeof name === "string" && name.length > 0) {
            clause[Op.like] = "%" + name + "%";
            query.where[Op.and].push(
                where(fn("CONCAT", col("firstName"), col("lastName")), clause)
            );
        }
        if (typeof status === "string") {
            query.where[Op.and].push({status: buildClause(Op.eq, status)});
        }
        results = await registration.findAll(query);
        if (offset > 0) {
            formerLastId = results.shift();
            formerLastId = formerLastId?.id;
        }
        return {
            formerLastId,
            lastId: results.at(-1)?.id,
            values: results.map((result) => result.toResponse())
        };
    };
    emitter.decorate(registration);
    return registration;
}

module.exports = defineDriverRegistration;