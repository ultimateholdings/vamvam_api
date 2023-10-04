/*jslint node this*/
const {DataTypes, Op, col, fn, where} = require("sequelize");
const {
    ages,
    userStatuses
} = require("../utils/config");
const {
    hashPassword,
    pathToURL,
    propertiesPicker
} = require("../utils/helpers");

const order = [["createdAt", "DESC"]];

function initialQuery(offset, maxSize) {
    const query = Object.create(null);
    query.limit = maxSize;
    query.offset = offset;
    if (offset > 0) {
        query.limit = maxSize + 1;
        query.offset = offset - 1;
    }
    return query;
}

function getValidationClause(from, to) {
    let after;
    let before;
    const clause = {};
    clause[Op.and] = [];
    before = Date.parse(to);
    after = Date.parse(from);
    if (Number.isFinite(before)) {
        clause[Op.and].push({
/*jslint-disable*/
            validationDate: {[Op.lte]: new Date(before)}
/*jslint-enable*/
        });
    }
    if (Number.isFinite(after)) {
        clause[Op.and].push({
/*jslint-disable*/
            validationDate: {[Op.gte]: new Date(after)}
/*jslint-enable*/
        });
    }
    if (clause[Op.and].length <= 0) {
        clause[Op.and].push({validationDate: null});
    }
    return clause;
}

function defineDriverRegistration(connection) {
    const schema = {
        age: {
            allowNull: false,
            type: DataTypes.ENUM,
            values: ages
        },
        carInfos: DataTypes.STRING,
        email: {
            type: DataTypes.STRING,
            unique: true,
            validate: {
                isEmail: true
            }
        },
        firstName: DataTypes.STRING,
        gender: {
            defaultValue: "M",
            type: DataTypes.ENUM,
            values: ["F", "M"]
        },
        id: {
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            type: DataTypes.UUID
        },
        lang: DataTypes.STRING,
        lastName: DataTypes.STRING,
        password: DataTypes.STRING,
        phoneNumber: {
            allowNull: false,
            type: DataTypes.STRING,
            unique: true
        },
        sponsorCode: DataTypes.STRING,
        status: {
            defaultValue: userStatuses.pendingValidation,
            type: DataTypes.ENUM,
            values: Object.values(userStatuses)
        },
        validationDate: DataTypes.DATE
    };
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
        from,
        maxSize,
        name,
        offset,
        to
    }) {
        let formerLastId;
        let results;
        const clause = {};
        const query = initialQuery(offset, maxSize);
        query.order = order;
        query.where = {};
        query.where[Op.and] = [getValidationClause(from, to)];
        if (typeof name === "string" && name.length > 0) {
            clause[Op.like] = "%" + name + "%";
            query.where[Op.and].push(
                where(fn("CONCAT", col("firstName"), col("lastName")), clause)
            );
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
    return registration;
}

module.exports = defineDriverRegistration;