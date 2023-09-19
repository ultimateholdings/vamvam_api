/*jslint
node, nomen, this
*/
const fs = require("fs");
const {
/*jslint-disable*/
    Op,
    col,
    fn,
    where,
/*jslint-enable*/
    DataTypes
} = require("sequelize");
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

function defineUserModel(connection) {
    const schema = {
        age: {
            type: DataTypes.ENUM,
            values: ages
        },
        available: {
            defaultValue: true,
            type: DataTypes.BOOLEAN
        },
        avatar: DataTypes.STRING,
        carInfos: DataTypes.STRING,
        deviceToken: DataTypes.STRING,
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
        internal: {
            defaultValue: false,
            type: DataTypes.BOOLEAN
        },
        lang: {
            defaultValue: "en",
            type: DataTypes.STRING
        },
        lastName: DataTypes.STRING,
        password: DataTypes.STRING,
        phone: {
            allowNull: false,
            type: DataTypes.STRING,
            unique: true
        },
        position: new DataTypes.GEOMETRY("POINT"),
        role: {
            defaultValue: availableRoles.clientRole,
            type: DataTypes.ENUM,
            values: Object.values(availableRoles)
        },
        status: {
            defaultValue: userStatuses.activated,
            type: DataTypes.ENUM,
            values: Object.values(userStatuses)
        }
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
        }
    });
    user.prototype.toResponse = function () {
        let result = this.dataValues;
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
        return propertiesPicker(result)(allowedProps);
    };

    user.prototype.toShortResponse = function () {
        let result = this.dataValues;
        if (result.avatar !== null && result.avatar !== undefined) {
            result.avatar = pathToURL(result.avatar);
        }
        return propertiesPicker(result)(shortDescriptionProps);
    };

/*
Please note that these GIS functions are only supported on
PostgreSql, Mysql and MariaDB so if your DB doesn't support it
its better to use the haversine formula to get the distance between 2 points
link: https://en.wikipedia.org/wiki/Haversine_formula
*/
/*jslint-disable*/
    user.nearTo = async function ({by, params, point}) {
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
            ),fn("ST_GeomFromText", coordinates, 4326));
            clause.push(where(distanceQuery(), {[Op.lte]: by}));
            if (params !== null && typeof params === "object") {
                clause.push(params);
            }
            result = await user.findAll({
                attributes: {
                    includes: [[distanceQuery(), "distance"]]
                },
                where: {
                    [Op.and]: clause
                }
            });
        }
        return result ?? [];
    };
    user.getAll = async function ({
        maxSize = 10,
        offset = 0,
        role
    }) {
        let query;
        let results;
        let formerLastId;
        query = {
            limit: (offset > 0 ? maxSize + 1: maxSize),
            offset: (offset > 0 ? offset - 1: offset),
            order: [["createdAt", "DESC"]]
        };
        if (typeof role === "string") {
            query.where = {role};
        } else {
            query.where = {
                role: {[Op.notIn]: [availableRoles.adminRole]}
            };
        }
        results = await user.findAll(query);
        if (offset > 0) {
            formerLastId = results.shift();
            formerLastId = formerLastId?.id;
        }
        return {
            lastId: results.at(-1)?.id,
            formerLastId,
            values: results.map((user) => user.toResponse())
        };
    };
    user.prototype.setAvailability = function available (isAvailable) {
        this.available = isAvailable;
        return this.save();
    }
    user.setAvailability = function (driver, available) {
        driver.available = available;
        return driver.save();
    }
/*jslint-enable*/
    user.genericProps = genericProps;
    user.statuses = userStatuses;
/*jslint-disable*/
    user.getAllByPhones = function (phoneList) {
        return user.findAll({
            where: {
                phone: {[Op.in]: phoneList}
            }
        });
    };
/*jslint-enable*/
    return user;
}

module.exports = defineUserModel;