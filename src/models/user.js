/*jslint
node, nomen, this
*/
const fs = require("fs");
const {DataTypes, Op, col, fn, where} = require("sequelize");
const {
    fileExists,
    formatDbPoint,
    hashPassword,
    pathToURL,
    propertiesPicker
} = require("../utils/helpers");
const {
    ages,
    availableRoles,
    userStatuses
} = require("../utils/config");
const {enumType, required, uuidType} = require("../utils/db-connector");
const types = require("./helper");
const schema = {
    age: enumType(ages, ages[0]),
    available: required(DataTypes.BOOLEAN, true).with({defaultValue: true}),
    avatar: DataTypes.STRING,
    carInfos: DataTypes.STRING,
    deviceToken: DataTypes.STRING,
    email: {
        type: DataTypes.STRING,
        unique: true,
        validate: {isEmail: true}
    },
    firstName: DataTypes.STRING,
    gender: enumType(["F", "M"], "M"),
    id: uuidType(),
    internal: required(DataTypes.BOOLEAN, true).with({defaultValue: false}),
    lang: required(DataTypes.STRING, true).with({defaultValue: "en"}),
    lastName: DataTypes.STRING,
    password: DataTypes.STRING,
    phone: required(DataTypes.STRING).with({unique: true}),
    position: new DataTypes.GEOMETRY("POINT"),
    role: enumType(availableRoles, availableRoles.clientRole),
    status: enumType(userStatuses, userStatuses.activated)
};
const excludedProps = ["password", "deviceToken"];
const forbiddenUpdate = [
    "position",
    "role",
    "id",
    "available",
    "phone",
    "password"
];
const shortDescriptionProps = [
    "id",
    "avatar",
    "firstName",
    "lastName",
    "phone"
];
function defineUserModel(connection) {
    const allowedProps = Object.keys(schema).filter(
        (key) => !excludedProps.includes(key)
    );
    const genericProps = Object.keys(schema).filter(
        (prop) => !forbiddenUpdate.includes(prop)
    );
    const user = connection.define("user", schema, {
        hooks: {
            beforeCreate: async function (record) {
                let {password} = record.dataValues;
                let hash;
                if (password !== undefined && password !== null) {
                    hash = await hashPassword(password);
                    record.dataValues.password = hash;
                }
            },
            beforeUpdate: async function (record) {
                let {password} = record.dataValues;
                const {
                    dataValues: current,
                    _previousDataValues: previous = {},
                    _changed: updates = new Set()
                } = record;
                let hash;
                let previousAvatarExists;
                let previousInfoExists;
                previousAvatarExists = await fileExists(previous.avatar);
                previousInfoExists = await fileExists(previous.carInfos);
                if (updates.has("password")) {
                    hash = await hashPassword(password);
                    current.password = hash;
                }

                if (updates.has("avatar") && previousAvatarExists) {
                    fs.unlink(previous.avatar, console.log);
                }

                if (
                    updates.has("carInfos") &&
                    previousInfoExists
                ) {
                    fs.unlink(previous.carInfos, console.log);
                }
            }
        },
        paranoid: true
    });
    user.prototype.toResponse = function () {
        let data = this.dataValues;
        let result = Object.assign({}, data);
        result.position = formatDbPoint(result.position);
        if (result.avatar !== null && result.avatar !== undefined) {
            result.avatar = pathToURL(result.avatar);
        }
        if (result.carInfos !== null && result.carInfos !== undefined) {
            result.carInfos = pathToURL(result.carInfos);
        }
        if (result.role !== availableRoles.driverRole) {
            delete result.carInfos;
            delete result.available;
            delete result.position;
        }
        result = propertiesPicker(result)(allowedProps);
        if (data.deletedAt !== null) {
            result.deleted = true;
        }
        return result;
    };

    user.prototype.toShortResponse = function () {
        let result = this.dataValues;
        if (result.avatar !== null && result.avatar !== undefined) {
            result.avatar = pathToURL(result.avatar);
        }
        return propertiesPicker(result)(shortDescriptionProps);
    };

/**Please note that these GIS functions are only supported on
 * PostgreSql, Mysql and MariaDB so if your DB doesn't support it
 * its better to use the haversine formula to get the distance between 2 points
 * link: https://en.wikipedia.org/wiki/Haversine_formula
 */
    user.nearTo = async function nearTo({by, params, point}) {
        let result = [];
        let coordinates = point?.coordinates;
        let distanceQuery;
        let clause = [];
        if (Array.isArray(coordinates)) {
            coordinates =
            "POINT(" + coordinates[0] + " " + coordinates[1] + ")";
            distanceQuery = () => fn("ST_Distance_Sphere", fn(
                "ST_GeomFromText",
                fn("ST_AsText", col("position")),
                4326
            ), fn("ST_GeomFromText", coordinates, 4326));
            clause.push(where(distanceQuery(), types.buildClause(Op.lte, by)));
            if (params !== null && typeof params === "object") {
                clause.push(params);
            }
            result = await user.findAll({
                attributes: {
                    includes: [[distanceQuery(), "distance"]]
                },
                where: types.buildClause(Op.and, clause)
            });
        }
        return result ?? [];
    };
    user.prototype.setAvailability = function available(isAvailable) {
        this.available = isAvailable;
        return this.save();
    };
    user.getAllWithRoles = function (roles = []) {
        const role = types.buildClause(Op.in, roles);
        return user.findAll({where: {role}});
    };
    user.getRolesCount = async function countGetter({from, to}) {
        let result = await user.count({
            attributes: ["role"],
            group: ["role"],
            where: types.buildPeriodQuery(from, to)
        });
        result = result.reduce(function (acc, {role, count}) {
            if (role !== "admin") {
                acc[role] = count;
            }
            acc.total += count;
            return acc;
        }, {total: 0});
        return result;
    };
    user.genericProps = genericProps;
    user.statuses = userStatuses;
    user.getClientByPhones = function (phoneList) {
        return user.findAll({
            where: types.buildClause(Op.and, [
                {phone: types.buildClause(Op.in, phoneList)},
                {role: types.buildClause(Op.eq, availableRoles.clientRole)}
            ])
        });
    };
    return user;
}

module.exports = defineUserModel;
