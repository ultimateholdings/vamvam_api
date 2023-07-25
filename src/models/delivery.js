/*jslint
node
*/
const {DataTypes} = require("sequelize");
const {CustomEmitter, propertiesPicker} = require("../utils/helpers");

function defineDeliveryModel(connection) {
    const emitter = new CustomEmitter();
    const availableStatus = Object.freeze({
        cancelled: "cancelled",
        initial: "pending-driver-approval",
        pendingReception: "pending-driver-reception",
        toBeConfirmed: "pending-client-approval",
        started: "started",
        terminated: "terminated",
    });
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
        price: DataTypes.DOUBLE,
        recipientInfos: {
            allowNull: false,
            type: DataTypes.JSON
        },
        status: {
            defaultValue: "pending-driver-approval",
            type: DataTypes.ENUM,
            values: Object.values(availableStatus)
        }
    };
    const delivery = connection.define("delivery", schema);
    delivery.prototype.toResponse = function () {
        const allowedProps = Object.keys(schema).filter((key) => key !== "deliveryMeta");
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
    delivery.addEventListener = function (eventName, func) {
        emitter.on(eventName, func);
    }
    delivery.emitEvent = function (eventName, data) {
        emitter.emit(eventName, data);
    }
    delivery.statuses = availableStatus;
    return delivery;
}

module.exports = defineDeliveryModel;