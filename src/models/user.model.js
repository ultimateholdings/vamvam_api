const { DataTypes } = require("sequelize");
const database = require("../config/database");
const bcrypt = require("bcrypt");

const User = database.define(
  "User",
  {
    userId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
      autoIncrement: false,
    },
    firstName: DataTypes.STRING,
    lastName: DataTypes.STRING,
    avatar: DataTypes.STRING,
    phone: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    email: {
      type: DataTypes.STRING,
      unique: true,
      validate: {
        isValidateEmail: function (value) {
          const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
          if (!emailRegex.test(value)) {
            throw new Error("Please enter a valid email!");
          }
        },
      },
    },
    password: {
      type: DataTypes.STRING,
      validate: {
        isValidatePassword: function (value) {
          const passwordRegex =
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
          if (!passwordRegex.test(value)) {
            throw new Error(
              "The password must contain 8 characters, 1 uppercase, 1 lowercase, one number and one special character!"
            );
          }
        },
      },
    },
    role: {
      type: DataTypes.ENUM,
      values: ["client", "driver", "admin"],
      defaultValue: "client",
    },
  },
);

User.beforeUpdate(async (user) => {
  try {
    const hash = await bcrypt.hash(user.password, 10);
    user.password = hash;
  } catch (err) {
    throw new Error();
  }
});

module.exports = User;
