/*jslint
node, nomen
*/
const fs = require("fs");
const {DataTypes} = require("sequelize");
const {hashPassword, fileExists} = require("../utils/helpers");


function defineUserModel(connection) {
    const user = connection.define("user", {
        age: {
          type: DataTypes.ENUM,
          values: ["18-24", "25-34", "35-44", "45-54", "55-64", "64+"]
        },
        avatar: DataTypes.STRING,
        carInfos: DataTypes.STRING,
        deviceToken: DataTypes.STRING,
        email: {
            type: DataTypes.STRING,
            unique: true,
            validate: {
                isValidateEmail: function (value) {
                    const emailRegex = /^[\w-.+]+@([\w\-]+\.)+[\w\-]{2,4}$/g;
                    if (emailRegex.test(value) === false) {
                        throw new Error("Please enter a valid email!");
                    }
                }
            }
        },
        firstName: DataTypes.STRING,
        lastName: DataTypes.STRING,
        password: {
            type: DataTypes.STRING,
            validate: {
                isValidatePassword: function (value) {
                    if (value.toString().length < 8) {
                        throw new Error(
                            "The password must contain at least 8 characters,"
                        );
                    }
                }
            }
        },
        phone: {
            allowNull: false,
            type: DataTypes.STRING,
            unique: true
        },
        position: new DataTypes.GEOMETRY("POINT"),
        role: {
            defaultValue: "client",
            type: DataTypes.ENUM,
            values: ["client", "driver", "admin"]
        },
        gender: {
            defaultValue: "M",
            type: DataTypes.ENUM,
            values: ["F", "M"]
        },
        id: {
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            type: DataTypes.UUID
        }
    }, {
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
    return user;
}

module.exports = defineUserModel;