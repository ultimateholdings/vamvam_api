/*jslint
node this
*/
const {DataTypes, Op, col, fn, where} = require("sequelize");
const {
    CustomEmitter,
    formatDbLineString,
    formatDbPoint,
    propertiesPicker
} = require("../utils/helpers");
const {
    apiDeliveryStatus,
    apiSettings,
    conflictStatuses,
    dbSettings,
    dbStatusMap,
    deliveryStatuses
} = require("../utils/config");
const {
    buildClause,
    buildPeriodQuery,
    constraints,
    join,
    paginationQuery
} = require("./helper");
const types = require("../utils/db-connector");

const hiddenProps = ["code", "deliveryMeta"];
const order = [["createdAt", "DESC"]];
const settings = Object.entries(apiSettings.delivery.defaultValues).reduce(
    function (acc, [key, value]) {
        acc[dbSettings[apiSettings.delivery.value].options[key]] = value;
        return acc;
    },
    Object.create(null)
);
const deliverySchema = {
    begin: DataTypes.DATE,
    code: DataTypes.STRING,
    deliveryMeta: DataTypes.JSON,
    departure: types.required(),
    destination: types.required(),
    end: DataTypes.DATE,
    id: types.uuidType(),
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
    packageType: types.required(DataTypes.STRING),
    price: DataTypes.DOUBLE,
    recipientInfos: types.required(DataTypes.JSON),
    route: new DataTypes.GEOMETRY("LINESTRING"),
    status: types.enumType(deliveryStatuses, deliveryStatuses.initial)
};
const conflictSchema = {
    cancellationDate: DataTypes.DATE,
    id: types.uuidType(),
    lastLocation: types.required(),
    lastLocationAddress: DataTypes.STRING,
    status: types.enumType(conflictStatuses, conflictStatuses.opened),
    type: types.required(DataTypes.STRING)
};
const updatableProps = [
    "departure",
    "destination",
    "packageType",
    "recipientInfos"
];

function defineDeliveryModel(connection, userModel) {
    const emitter = new CustomEmitter("Delivery Emitter");
    const delivery = connection.define("delivery", deliverySchema);
    const conflict = connection.define("delivery_conflict", conflictSchema);
    const allowedProps = Object.keys(deliverySchema).filter(
        (key) => !hiddenProps.includes(key)
    );
    const conflictProps = Object.keys(conflictSchema);
    const deliveryJoin = [
        join(userModel, "Client"),
        join(userModel, "Driver")
    ];

    delivery.belongsTo(userModel, constraints("driverId", "Driver"));
    delivery.belongsTo(userModel, constraints("clientId", "Client"));
    conflict.belongsTo(userModel, constraints("assignerId", "Assigner"));
    conflict.belongsTo(userModel, constraints("reporterId", "Reporter"));
    conflict.belongsTo(delivery, constraints("deliveryId", "Delivery"));
    conflict.belongsTo(userModel, constraints("assigneeId", "backupDriver"));
    delivery.belongsTo(conflict, constraints("conflictId", "Conflict"));

    function getDeliveries({limit, offset, order, clause: where}) {
        const include = deliveryJoin.concat(join(conflict, "Conflict", false));
        return delivery.findAll({include, limit, offset, order, where});
    }
    delivery.prototype.toResponse = function () {
        let recipientInfos = {otherPhones: []};
        let result = this.dataValues;
        const meta = result.deliveryMeta;
        result.departure = formatDbPoint(result.departure);
        result.destination = formatDbPoint(result.destination);
        if (typeof meta === "object") {
            result.departure.address = meta.departureAddress;
            result.destination.address = meta.destinationAddress;
        }
        result.route = formatDbLineString(result.route);
        recipientInfos.name = (
            result.recipientInfos?.main?.firstName
            ?? result.recipientInfos?.main?.name
            ?? ""
        );
        recipientInfos.phone = result.recipientInfos?.main?.phone ?? "";
        if (Array.isArray(result.recipientInfos.others)) {
            result.recipientInfos.others.forEach(function (data) {
                if (typeof data.phone === "string") {
                    recipientInfos.otherPhones.push(data.phone);
                }
            });
        }
        result.recipientInfos = recipientInfos;
        return propertiesPicker(result)(allowedProps);
    };
    delivery.prototype.toShortResponse = function () {
        const {deliveryMeta, id} = this.dataValues;
        return {
            departure: deliveryMeta.departureAddress,
            destination: deliveryMeta.destinationAddress,
            id
        };
    };
    conflict.prototype.toResponse = function () {
        const result = this.dataValues;
        result.lastLocation = formatDbPoint(result.lastLocation);
        result.lastLocation.address = result.lastLocationAddress;
        result.date = result.createdAt.toISOString();
        return propertiesPicker(result)(conflictProps);
    };
    delivery.getOngoing = function (driverId) {
        return delivery.findAll({
            where: {
                driverId,
                status: buildClause(Op.in, [
                    deliveryStatuses.started,
                    deliveryStatuses.pendingReception,
                    deliveryStatuses.toBeConfirmed
                ])
            }
        });
    };
    delivery.prototype.getRecipientPhones = function () {
        let {main, others} = this.dataValues.recipientInfos;
        let result = [];
        if (typeof main?.phone === "string") {
            result.push(main.phone);
        }
        if (Array.isArray(others)) {
            others.forEach(function (user) {
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
    delivery.getAnalytics = async function analyticsGetter({from, to}) {
        let query = {
            attributes: ["status"],
            group: ["status"],
            where: buildClause(Op.and, buildPeriodQuery(from, to))
        };
        let results = await delivery.count(query);
        const initialResult = Object.keys(apiDeliveryStatus).reduce(
            function (acc, key) {
                acc[key] = 0;
                return acc;
            },
            {total: 0}
        );
        results = results.reduce(function (acc, entry) {
            if (dbStatusMap[entry.status] !== undefined) {
                acc[dbStatusMap[entry.status]] = entry.count;
                acc.total += entry.count;
            }
            return acc;
        }, initialResult);
        return results;
    };

    delivery.getAll = async function ({from, maxSize, offset, status, to}) {
        let results;
        let formerLastId;
        const query = paginationQuery(offset ?? 0, maxSize ?? 10);
        query.include = [
            join(userModel, "Client"),
            join(userModel, "Driver", false)
        ];
        query.where = buildClause(Op.and, buildPeriodQuery(
            from,
            to,
            "delivery.CreatedAt"
        ));
        query.order = order;
        if (Array.isArray(status)) {
            query.where.status = buildClause(Op.in, status);
        }
        results = await delivery.findAll(query);
        if ((offset ?? 0) > 0) {
            formerLastId = results.shift();
            formerLastId = formerLastId?.id;
        }
        return {
            formerLastId,
            lastId: results.at(-1)?.id,
            values: results.map(function deliveryMapper(delivery) {
                let result = delivery.toResponse();
                result.client = delivery.Client.toShortResponse();
                if (delivery.Driver !== null) {
                    result.driver = delivery.Driver.toShortResponse();
                }
                return result;
            })
        };
    };
    delivery.getTerminated = async function ({maxSize, offset, userId}) {
        let results;
        let formerLastId;
        const query = paginationQuery(offset ?? 0, maxSize ?? 10);
        query.clause = buildClause(Op.and, [
            {status: deliveryStatuses.terminated},
            buildClause(Op.or, [
                {clientId: buildClause(Op.eq, userId)},
                {"$Conflict.assigneeId$": buildClause(Op.eq, userId)},
                {driverId: buildClause(Op.eq, userId)}
            ])
        ]);
        results = await getDeliveries(query);
        if ((offset ?? 0) > 0) {
            formerLastId = results.shift();
            formerLastId = formerLastId?.id;
        }
        return {
            formerLastId,
            lastId: results.at(-1)?.id,
            values: results
        };
    };
    delivery.withStatuses = function (userId, statuses) {
        const recipientClause = where(
            fn("JSON_SEARCH", col("recipientInfos"), "one", userId),
            buildClause(Op.not, null)
        );
        const clause = buildClause(Op.and, [
            {status: buildClause(Op.in, statuses)},
            buildClause(Op.or, [
                {driverId: buildClause(Op.eq, userId)},
                {"$Conflict.assigneeId$": buildClause(Op.eq, userId)},
                buildClause(Op.or, [
                    {clientId: buildClause(Op.eq, userId)},
                    recipientClause
                ])
            ])
        ]);
        return getDeliveries({clause, order});
    };
    delivery.getUserById = (id) => userModel.findOne({where: {id}});
    delivery.addConflict = (conflictDatas) => conflict.create(conflictDatas);
    delivery.getConflict = function ({deliveryId, id}) {
        const clause = {};
        if (typeof deliveryId === "string") {
            clause.deliveryId = deliveryId;
        }
        if (typeof id === "string") {
            clause.id = id;
        }
        if (Object.keys(clause).length > 0) {
            return conflict.findOne({where: clause});
        }
        return null;
    };
    delivery.getById = (id) => delivery.findOne({where: {id}});
    delivery.updateUser = function (id) {
        return {
            with: async function (datas) {
                const [updated] = await userModel.update(
                    datas,
                    {where: {id}}
                );
                return updated > 0;
            }
        };
    };
    delivery.getClientByPhones = userModel.getClientByPhones;
    delivery.getNearbyDrivers = userModel.nearTo;
    delivery.getAllConflicts = async function ({assignerId, maxSize, offset}) {
        let results;
        let formerLastId;
        const query = paginationQuery(offset, maxSize ?? 10);
        query.where = {assignerId: null};
        query.include = [
            join(delivery, "Delivery").with({include: deliveryJoin}),
            join(userModel, "Reporter")
        ];
        if (typeof assignerId === "string") {
            query.where = {assignerId};
        }
        results = await conflict.findAll(query);
        if ((offset ?? 0) > 0) {
            formerLastId = results.shift();
            formerLastId = formerLastId?.id;
        }
        return {
            formerLastId,
            lastId: results.at(-1)?.id,
            values: results.map(function (conflict) {
                const result = conflict.toResponse();
                const response = conflict.Delivery.toResponse();
                const client = conflict.Delivery.Client.toShortResponse();
                const driver = conflict.Delivery.Driver.toShortResponse();
                response.client = client;
                response.driver = driver;
                result.reporter = conflict.Reporter.toShortResponse();
                result.delivery = response;
                return result;
            })
        };
    };
    delivery.getDeliveryDetails = async function (id) {
        const deliveries = await getDeliveries({clause: {id}});
        return deliveries[0];
    };

    userModel.getDeliveriesAnalytics = delivery.getAnalytics;
    userModel.hasOngoingDelivery = async function (driverId) {
        const result = await delivery.getOngoing(driverId);
        return result.length > 0;
    };
    emitter.decorate(delivery);
    delivery.getSettings = () => settings;
    userModel.getSettings = () => settings;
    delivery.setSettings = (data) => Object.entries(data).forEach(
        function ([key, val]) {
            settings[key] = val;
        }
    );
    delivery.updatableProps = updatableProps;
    delivery.ongoingStates = [
        deliveryStatuses.pendingReception,
        deliveryStatuses.toBeConfirmed,
        deliveryStatuses.started,
        deliveryStatuses.inConflict
    ];
    return Object.freeze({conflict, delivery});
}

module.exports = defineDeliveryModel;
