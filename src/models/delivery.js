/*jslint
node
*/
const {DataTypes, Op} = require("sequelize");
const {
    CustomEmitter,
    formatDbLineString,
    propertiesPicker
} = require("../utils/helpers");
const {apiSettings, dbSettings, deliveryStatuses} = require("../utils/config");

const hiddenProps = ["code", "deliveryMeta"];

function defineDeliveryModel(connection) {
    const emitter = new CustomEmitter();
    const settings = Object.entries(apiSettings.delivery.defaultValues).reduce(
        function (acc, [key, value]) {
            acc[dbSettings[apiSettings.delivery.value].options[key]] = value;
            return acc;
        },
        Object.create(null)
    );
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
                    msg: "The rating should not be greater than 5"
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
        let recipientInfos = {otherPhones: []};
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
        if (result.route !== null) {
            result.route = formatDbLineString(result.route);
        }
        recipientInfos.name = (
            result.recipientInfos?.main?.firstName
            ?? result.recipientInfos?.name
            ?? ""
        );
        recipientInfos.phone = (
            result.recipientInfos?.main?.phone
            ?? result.recipientInfos.phone
            ?? ""
        );
        if (Array.isArray(result.recipientInfos.others)) {
            result.recipientInfos.others.forEach(function (data) {
                if (typeof data.phone === "string") {
                    recipientInfos.otherPhones.push(data.phone);
                }
            });
        } else {
            recipientInfos.otherPhones.push(
                ...result.recipientInfos.otherPhones
            );
        }
        result.recipientInfos = recipientInfos;
        return propertiesPicker(result)(allowedProps);
    };
/*jslint-disable*/
    delivery.getOngoing = function (driverId) {
        return delivery.findAll({where: {
            driverId,
            status: {[Op.in]: [
                [
                    deliveryStatuses.started,
                    deliveryStatuses.pendingReception,
                    deliveryStatuses.toBeConfirmed
                ]
            ]}
        }});
    };
/*jslint-enable*/
    delivery.prototype.getRecipientPhones = function () {
/*
    these 4 properties are used to enable background compatibility
    of models due to the fact that recipientInfos structure changed
*/
        let {
            phone,
            main,
            others,
            otherPhones
        } = this.dataValues.recipientInfos;
        let result = [];
        if (typeof phone === "string") {
            result.push(phone);
        }
        if (Array.isArray(otherPhones)) {
            result.push(...otherPhones);
        }
        if (typeof main?.phone === "string") {
            result.push(main.phone);
        }
        if (Array.isArray(others)) {
            others.forEach(function(user) {
                if (typeof user.phone === "string") {
                    result.push(user.phone);
                }
            });
        }
        return result;
    };
    delivery.prototype.getRecipientsId = function () {
        let {main, others} = this.dataValues.recipientInfos;
        const result = [];
        if (typeof main?.id === "string") {
            result.push(main.id);
        }
        if (Array.isArray(others)) {
            others.forEach(function (user) {
                if (typeof user.id === "string") {
                    result.push(user.id);
                }
            });
        }
        return result;
    };
    delivery.getAllStats = function ({from, to}) {
        let query = {
            attributes: ["status"],
            group: ["status"],
            where: {
                [Op.and]: []
            }
        };
        if (Number.isFinite(Date.parse(from))) {
            query.where[Op.and].push({
                createdAt: {[Op.gte]: new Date(Date.parse(from))}
            });
        }
        if (Number.isFinite(Date.parse(to))) {
            query.where[Op.and].push({
                createdAt: {[Op.lte]: new Date(Date.parse(to))}
            });
        }
        return delivery.count(query);
    };
    delivery.ongoingDeliveries = function (driverId) {
        return delivery.findAll({where: {
            driverId,
            status: {[Op.in]: [
                deliveryStatuses.started,
                deliveryStatuses.pendingReception,
                deliveryStatuses.toBeConfirmed
            ]}
        }});
    }
    delivery.addEventListener = function (eventName, func) {
        emitter.on(eventName, func);
    };
    delivery.emitEvent = function (eventName, data) {
        emitter.emit(eventName, data);
    };
    delivery.getSettings = () => settings;
    delivery.setSettings = (data) => Object.entries(data).forEach(
        function ([key, val]) {
            settings[key] = val;
        }
    );
    delivery.updatableProps = updatableProps;
    return delivery;
}

module.exports = defineDeliveryModel;