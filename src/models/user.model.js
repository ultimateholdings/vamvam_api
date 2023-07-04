/*jslint
node
*/
const {DataTypes} = require("sequelize");
const {hashPassword} = require("../utils/helpers")

function defineUserModel (connection) {
    return connection.define("user", {
        avatar: DataTypes.STRING,
        email: {
            type: DataTypes.STRING,
            unique: true
        },
        firstName: DataTypes.STRING,
        lastName: DataTypes.STRING,
        password: DataTypes.STRING,
        phone: {
            allowNull: false,
            type: DataTypes.STRING,
            unique: true
        },
        role: {
            defaultValue: "client",
            type: DataTypes.ENUM,
            values: ["client", "driver", "admin"]
        },
        userId: {
            defaultValue: DataTypes.UUIDV4,
            primary: true,
            type: DataTypes.UUID
        }
    }, {
        hooks: {
            async beforeCreate(record) {
                let {password, email} = record.dataValues;
                let hash;
                if (
                    (email != null) && 
                    (!email.match(/^[\w-\.+]+@([\w-]+\.)+[\w-]{2,4}$/g))
                ) {
                    throw new Error("Invalid Email adress");
                }
                if (password != null) {
                    hash = await hashPassword(password);
                    record.dataValues.password = hash;
                }
            }
        }
    });
}

module.exports = defineUserModel;