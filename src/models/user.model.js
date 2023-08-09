/*jslint
node, nomen, this
*/
const fs = require("fs");
const path = require("path");
const {DataTypes, QueryTypes} = require("sequelize");
const {
    fileExists,
    formatDbPoint,
    hashPassword,
    propertiesPicker
} = require("../utils/helpers");
const {availableRoles, uploadsRoot, userStatuses} = require("../utils/config");

function defineUserModel(connection) {
    const schema = {
        age: {
            type: DataTypes.ENUM,
            values: ["18-24", "25-34", "35-44", "45-54", "55-64", "64+"]
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
            defaultValue: userStatuses.pendingValidation,
            type: DataTypes.ENUM,
            values: Object.values(userStatuses)
        }
    };
    const driverRegistrationDatas = [
        "phone",
        "firstName",
        "lastName",
        "password",
        "carInfos",
        "gender",
        "age",
        "email"
    ];
    const excludedProps = ["password", "deviceToken"];
    const forbiddenUpdate = ["position", "role", "id", "phone", "password"];
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
            result.avatar = uploadsRoot + path.basename(result.avatar);
        }
        if (result.carInfos !== null && result.carInfos !== undefined) {
            result.carInfos = uploadsRoot + path.basename(result.carInfos);
        }
        if (result.role !== availableRoles.driverRole) {
            delete result.carInfos;
            delete result.available;
            delete result.position;
        }
        return propertiesPicker(result)(allowedProps);
    };

/*
Please note that these GIS functions are only supported on
PostgreSql, Mysql and MariaDB so if your DB doesn't support it
it better to use the haversine formula to get the distance between 2 points
link: https://en.wikipedia.org/wiki/Haversine_formula
*/
    user.nearTo = async function (point, by, role) {
        let result = [];
        let sql = ["deviceToken", ...allowedProps];
        let coordinates = point?.coordinates;
        let distanceQuery;
        sql = sql.join(" , ");
        if (Array.isArray(coordinates)) {
            coordinates = "'POINT(" + coordinates[0] + " " +
            coordinates[1] + ")'";
            distanceQuery = "ST_Distance_Sphere(ST_GeomFromText(";
            distanceQuery += "ST_AsText(position), 4326), ST_GeomFromText(";
            distanceQuery += coordinates + ", 4326))";
            sql = sql + " , " + distanceQuery + " as distance from ";
            sql = "select " + sql + this.getTableName();
            sql += " where " + distanceQuery + " <= " + by;
            sql += " and `role` = '" + role + "';";
            result = await connection.query(sql, {type: QueryTypes.SELECT});
        }
        return result ?? [];
    };
    user.genericProps = genericProps;
    user.registrationDatas = driverRegistrationDatas;
    user.statuses = userStatuses;
    return user;
}

module.exports = defineUserModel;