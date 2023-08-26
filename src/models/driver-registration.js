
const path = require("node:path");
const {DataTypes} = require("sequelize");
const {
    ages,
    registrationsRoot,
    userStatuses
} = require("../utils/config");
const {
    CustomEmitter,
    hashPassword,
    pathToURL,
    propertiesPicker
} = require("../utils/helpers");

function defineDriverRegistration(connection) {
    const emitter = new CustomEmitter("registration");
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
        lastName: DataTypes.STRING,
        password: DataTypes.STRING,
        phoneNumber: {
            allowNull: false,
            type: DataTypes.STRING,
            unique: true
        },
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
            },
        }
    });
    const optionalProps = ["id", "validationDate", "status"];
    const requiredProps = Object.keys(schema).filter(
        (key) => !optionalProps.includes(key)
    );
    registration.addEventListener = function (eventName, fn) {
        emitter.on(eventName, fn);
    }
    registration.emitEvent = function (eventName, data) {
        emitter.emit(eventName, data);
    }
    registration.prototype.toResponse = function () {
        let result = this.dataValues;
        let props  = Array.from(requiredProps);
        props.push("status", "id", "createdAt");
        result = propertiesPicker(result)(props);
        result.registrationDate = result.createdAt.toISOString();
        result.carInfos = pathToURL(result.carInfos);
        delete result.createdAt;
        delete result.password;
        return result;
    }

    registration.prototype.toUserData = function () {
        let result = this.dataValues;
        let props = Array.from(requiredProps);
        result = propertiesPicker(result)(props);
        result.phone = result.phoneNumber;
        delete result.phoneNumber;
        return result;
    }
    registration.requiredProps = requiredProps;
    return registration;
}

module.exports = defineDriverRegistration;