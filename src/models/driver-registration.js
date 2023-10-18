/*jslint node this*/
const {DataTypes, Op, col, fn, where} = require("sequelize");
const {ages, availableRoles, userStatuses} = require("../utils/config");
const {
    CustomEmitter,
    hashPassword,
    mergableObject,
    pathToURL,
    propertiesPicker
} = require("../utils/helpers");
const {
    buildClause,
    buildPeriodQuery,
    constraints,
    paginationQuery
} = require("./helper");
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
const optionalProps = ["id", "sponsorCode", "lang", "status"];
const requiredProps = Object.keys(schema).filter(
    (key) => !optionalProps.includes(key)
);
function defineDriverRegistration(connection, user) {
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
    registration.belongsTo(user, constraints("contributorId", "contributor"));
    registration.prototype.toResponse = function () {
        const data = this.dataValues;
        let result = Object.create(null);
        Object.assign(result, data);
        let props = requiredProps.concat("status", "id");
        result = propertiesPicker(result)(props);
        result.registrationDate = data.createdAt.toISOString();
        result.carInfos = pathToURL(result.carInfos);
        delete result.password;
        return result;
    };

    registration.prototype.toUserData = function () {
        let result = this.dataValues;
        result = propertiesPicker(result)(
            requiredProps.concat("sponsorCode", "lang")
        );
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
    registration.addDriver = async function (registrationData) {
        const driver = await user.create(registrationData);
        return {
            requestSponsoring: () => user.handleSponsoringRequest(
                    driver.id,
                    registrationData.sponsorCode
            ),
            value: driver
        };
    };
    registration.format = function (request) {
        const result = Object.create(mergableObject);
        return result.with(propertiesPicker(request)(requiredProps));
    };
    registration.getAdmins = function () {
        return user.getAllWithRoles([availableRoles.registrationManager]);
    }
    emitter.decorate(registration);
    return registration;
}

module.exports = defineDriverRegistration;