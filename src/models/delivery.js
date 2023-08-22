/*jslint
node
*/
const {DataTypes} = require("sequelize");
const {CustomEmitter, propertiesPicker} = require("../utils/helpers");
const {deliveryStatuses} = require("../utils/config");

const hiddenProps = ["code", "deliveryMeta"];

function defineDeliveryModel(connection) {
    const emitter = new CustomEmitter();
    const schema = {
        begin: DataTypes.DATE,
        code: DataTypes.STRING,
        deliveryMeta: DataTypes.JSON,
        departure: {
            allowNull: false,
            type: new DataTypes.GEOMETRY("POINT")
        },
        destination: {
            allowNull: false,
            type: new DataTypes.GEOMETRY("POINT")
        },
        end: DataTypes.DATE,
        id: {
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            type: DataTypes.UUID
        },
        note: {
            type: DataTypes.DOUBLE,
            validate: {
                max: {
                    args: [5],
                    msg: "The rating should not be greater than 0"
                },
                min: {
                    args: [0],
                    msg: "The rating should not be lesser than 0"
                }
            }
        },
        packageType: {
            allowNull: false,
            type: DataTypes.STRING
        },
        price: DataTypes.DOUBLE,
        recipientInfos: {
            allowNull: false,
            type: DataTypes.JSON
        },
        route: new DataTypes.GEOMETRY("LINESTRING"),
        status: {
            defaultValue: deliveryStatuses.initial,
            type: DataTypes.ENUM,
            values: Object.values(deliveryStatuses)
        }
    };
    const updatableProps = [
        "departure",
        "destination",
        "packageType",
        "recipientInfos"
    ];
    const delivery = connection.define("delivery", schema);
    delivery.prototype.toResponse = function () {
        const allowedProps = Object.keys(schema).filter(
            (key) => !hiddenProps.includes(key)
        );
        let result = this.dataValues;
        if (typeof result.deliveryMeta === "object") {
            result.destination = {
                address: result.deliveryMeta["destinationAddress"],
                latitude: result.destination.coordinates[0],
                longitude: result.destination.coordinates[1]
            };
            result.departure = {
                address: result.deliveryMeta["departureAddress"],
                latitude: result.departure.coordinates[0],
                longitude: result.departure.coordinates[1]
            };
        }
        return propertiesPicker(result)(allowedProps);
    }
    delivery.prototype.getRecipientPhones = function () {
        let {
            phone,
            otherPhones
        } = this.dataValues.recipientInfos;
        const result = [phone];
        if (Array.isArray(otherPhones)) {
            result.push(...otherPhones);
        }
        return result;
    }
    delivery.addEventListener = function (eventName, func) {
        emitter.on(eventName, func);
    }
    delivery.emitEvent = function (eventName, data) {
        emitter.emit(eventName, data);
    }
    delivery.updatableProps = updatableProps;
    return delivery;
}

module.exports = defineDeliveryModel;