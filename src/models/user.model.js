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
        unique: true,
        validate: {
          isValidateEmail: function (value) {
            const emailRegex = /^[\w-\.+]+@([\w-]+\.)+[\w-]{2,4}$/g;
            if (!emailRegex.test(value)) {
              throw new Error("Please enter a valid email!");
            }
          },
        },
        },
        firstName: DataTypes.STRING,
        lastName: DataTypes.STRING,
        password: {
          type: DataTypes.STRING,
          validate: {
            isValidatePassword: function (value) {
              const passwordRegex =
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
              if (!passwordRegex.test(value)) {
                throw new Error(
                  "The password must contain 8 characters," + 
                  " 1 uppercase, 1 lowercase, one number and one special character!"
                );
              }
            },
          },
        },
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
                let {password} = record.dataValues;
                let hash;
                if (password != null) {
                    hash = await hashPassword(password);
                    record.dataValues.password = hash;
                }
            },
            async beforeUpdate(record) {
              let {password} = record;
              let hash;
              if (password != null) {
                hash = await hashPassword(password);
                record.password = hash;
              }
            }
        }
    });
}

module.exports = defineUserModel;