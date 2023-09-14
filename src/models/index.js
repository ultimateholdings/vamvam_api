/*jslint
node
*/
const {Op, col, fn, literal, where} = require("sequelize");
const defineUserModel = require("./user.js");
const otpModel = require("./otp_request.js");
const defineDeliveryModel = require("./delivery.js");
const defineBundleModel = require("./bundle.js");
const defineTransactionModel = require("./transaction.js");
const definePaymentModel = require("./payment.js");
const defineReportModel = require("./delivery-report.js");
const defineRegistration = require("./driver-registration.js");
const defineRoomModel = require("./room.model");
const defineMessageModel = require("./message.model.js");
const defineUserRoomModel = require("./user_room.model.js");
const defineSettingsModel = require("./settings.js");
const defineBlackListModel = require("./blacklist.js");
const {sequelizeConnection} = require("../utils/db-connector.js");
const {deliveryStatuses} = require("../utils/config.js");
const {calculateSolde} = require("../utils/helpers.js");

const order = [["createdAt", "DESC"]];
const connection = sequelizeConnection();
const User = defineUserModel(connection);
const otpRequest = otpModel(connection);
const Delivery = defineDeliveryModel(connection);
const Bundle = defineBundleModel(connection);
const Trans = defineTransactionModel(connection);
const Payment = definePaymentModel(connection);
const DeliveryConflict = defineReportModel(connection);
const Registration = defineRegistration(connection);
const Message = defineMessageModel(connection);
const Room = defineRoomModel(connection);
const UserRoom = defineUserRoomModel(connection);
const Blacklist = defineBlackListModel(connection);
const Settings = defineSettingsModel(connection);
Delivery.belongsTo(User, {
    as: "Driver",
    constraints: false,
    foreignKey: {
        name: "driverId"
    }
});
Delivery.belongsTo(User, {
    as: "Client",
    constraints: false,
    foreignKey: {
        name: "clientId"
    }
});
Bundle.hasOne(Payment, {
    as: "Pack",
    constraints: false,
    foreignKey:{
        name: 'packId'
    } 
})
User.hasOne(Payment, {
    as: "Driver",
    constraints: false,
    foreignKey:{
        name: 'driverId'
    } 
})
Trans.belongsTo(User, {
    as: "Driver",
    constraints: false,
    foreignKey: {
        name: "driverId"
    }
});
DeliveryConflict.belongsTo(User, {
    as: "Assigner",
    constraints: false,
    foreignKey: {
        name: "assignerId"
    }
});
DeliveryConflict.belongsTo(User, {
    as: "Reporter",
    constraints: false,
    foreignKey: {
        name: "reporterId"
    }
});
DeliveryConflict.belongsTo(Delivery, {
    as: "Delivery",
    constraints: false,
    foreignKey: {
        name: "deliveryId"
    }
});
DeliveryConflict.belongsTo(User, {
    as: "backupDriver",
    constraints: false,
    foreignKey: {
        name: "assigneeId"
    }
});
Registration.belongsTo(User, {
    as: "contributor",
    constraints: false,
    foreignKey: {
        name: "contributorId"
    }
});
Message.belongsTo(User, {
    as: "sender",
    constraints: false,
    foreignKey: "senderId"
});
Room.belongsTo(Delivery, {
    constraints: false,
    foreignKey: "deliveryId"
});
Room.belongsToMany(User, {through: UserRoom});
User.belongsToMany(Room, {through: UserRoom});
Room.hasMany(Message, {foreignKey: "roomId"});
Message.belongsTo(Room, {foreignKey: "roomId"});

User.getSettings = Delivery.getSettings;
User.hasOngoingDelivery = async function (driverId) {
    let result = await Delivery.ongoingDeliveries(driverId);
    return result.length > 0;
};
Settings.addEventListener("settings-update", function (data) {
    if(data.type === "delivery") {
        Delivery.setSettings(data.value);
    }
    if (data.type === "otp") {
        otpRequest.setSettings(data.value);
    }
});
Message.getAllByRoom = async function ({
    maxSize,
    offset,
    roomId
}) {
    let query;
    let formerLastId;
    let results;
    query = {
        include: [
            {
                as: "sender",
                attributes: ["id", "firstName", "lastName", "avatar"],
                model: User
            },
            {
                model: Room,
                required: true
            }
        ],
        limit: (offset > 0 ? maxSize + 1: maxSize),
        offset: (offset > 0 ? offset - 1: offset),
        order: [["createdAt", "DESC"]]
    };
    if (typeof roomId === "string") {
        query.where = {roomId};
    }
    results = await Message.findAndCountAll(query);
    if (offset > 0) {
        formerLastId = results.rows.shift();
        formerLastId = formerLastId?.id;
    }
    return {
        lastId: results.rows.at(-1)?.id,
        formerLastId,
        values: results.rows.map(function deliveryMapper(row) {
            const {
                content,
                createdAt: date,
                id,
                room,
                sender
            } = row;
            return Object.freeze({
                content,
                date,
                id,
                room: room.toResponse(),
                sender: sender.toShortResponse()
            });
        })
    };
};

Message.getMissedMessages = async function (userId) {
    let clause = [
        where(
            fn("JSON_SEARCH", col("reader"), "one", userId),
            {[Op.is] : null}
        ),
        {senderId: {[Op.ne]: userId}}
    ];
    let result = await this.findAll({
        include: [
            {attributes: ["id", "name"], model: Room, required: true},
            {as: "sender", model: User, required: true}
        ],
        where: {
            [Op.and]: clause
        }
    });
    result = result.reduce(function (acc, row) {
        const {content, createdAt: date, id, room, sender} = row;
        if (acc[room.id] === undefined) {
            acc[room.id] = {
                count: 0,
                messages: [],
                roomName: room.name
            }
        }
        acc[room.id].count += 1;
        acc[room.id].messages.push({
            content,
            date,
            id,
            room: room.toResponse(),
            sender: sender.toShortResponse()
        });
        return acc;
    }, Object.create(null));
    return result;
}

Room.getUserRooms = async function (userId) {
    let result = await User.findOne({
        include: {
            model: Room,
            include: [
                {
                    model: Message,
                    required: true,
                    order: [["createdAt", "DESC"]],
                    attributes: ["id", "content", "createdAt", "senderId"],
                    limit: 1,
                    include: [
                      {
                          as: "sender",
                          model: User,
                          required: false,
                      },
                    ],
                },
                {
                    model: User,
                    required: true
                },
                {
                    model: Delivery,
                    required: true
                }
            ]
        },
        where: {id: userId}
    });
    return result.rooms.map(function (room) {
        let delivery = room.delivery.toResponse();
        const result = {
            createdAt: room.createdAt,
            id: room.id,
            delivery: {
                departure: delivery.departure.address ?? "",
                destination: delivery.destination.address ?? "",
                id: delivery.id
            },
            members: room.users.map((user) => user.toShortResponse()),
            name: room.name
        };
        const messages = room.Messages.map(
            (msg) => Object.freeze({
                content: msg.content,
                date: msg.createdAt.toISOString(),
                id: msg.id,
                room: room.toResponse(),
                sender: msg.sender.toShortResponse()
            })
        );
        if (messages.length > 0) {
            result.lastMessage = messages[0];
        }
        return result;
    });
}

function getDeliveries({clause, limit, offset, order}) {
    return Delivery.findAll({
        include: [
            {as: "Client", model: User, required: true},
            {as: "Driver", model: User, required: true}
        ],
        limit,
        offset,
        order,
        where: clause
    });
};

Delivery.withStatuses = function (userId, statuses) {
    const recipientClause = where(
        fn("JSON_SEARCH", col("recipientInfos"), "one", userId),
        {[Op.not]: null}
    );
    const clause = {
        [Op.and]: [
            {status: {[Op.in]: statuses}},
            {
                [Op.or]: [
                    {driverId: {[Op.eq]: userId}},
                    {
                        [Op.or]: [
                            {clientId: {[Op.eq]: userId}},
                            recipientClause
                        ]
                    }
                ]
            }
        ]
    };
    return getDeliveries({order, clause})
};

Delivery.getTerminated = async function ({
    maxSize = 10,
    offset = 0,
    userId
}) {
    let results;
    let formerLastId;
    const query = {order};
    query.limit = (
        offset > 0
        ? maxSize + 1
        : maxSize
    );
    query.offset = (
        offset > 0
        ? offset -1
        : offset
    );
    query.clause = {
        [Op.and]: [
            {status: deliveryStatuses.terminated},
            {
                [Op.or]: [
                    {clientId: {[Op.eq]: userId}},
                    {driverId: {[Op.eq]: userId}}
                ]
            }
        ]
    };
    results = await getDeliveries(query);
    if (offset > 0) {
        formerLastId = results.shift();
        formerLastId = formerLastId?.id;
    }
    return {
        formerLastId,
        lastId: results.at(-1)?.id,
        values: results
    };
};

Delivery.getAll = async function ({
    from,
    maxSize = 10,
    offset = 0,
    status,
    to
}) {
    let query;
    let results;
    let formerLastId;
    query = {
        include: [
            {as: "Client", model: User, required: true},
            {as: "Driver", model: User},
        ],
        limit: (offset > 0 ? maxSize + 1: maxSize),
        offset: (offset > 0 ? offset - 1: offset),
        order: [["createdAt", "DESC"]],
        where: {
            [Op.and]: []
        }
    };
    if (typeof status === "string") {
        query.where.status = status;
    }
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
    results = await Delivery.findAll(query);
    if (offset > 0) {
        formerLastId = results.shift();
        formerLastId = formerLastId?.id;
    }
    return {
        lastId: results.at(-1)?.id,
        formerLastId,
        values: results.map(function deliveryMapper(delivery) {
            let result = delivery.toResponse();
            if (delivery.Client !== null) {
                result.client = delivery.Client.toShortResponse();
            }
            if (delivery.Driver !== null) {
                result.driver = delivery.Driver.toShortResponse();
            }
            return result;
        })
    };
};
Trans.getAllByTime= async function ({limit, offset, start, end}) {
    const result = await Trans.findAndCountAll({
        limit,
        offset,
        order: [["createdAt", "DESC"]],
        include: [
            {
                as: "Driver",
                attributes: ["id", "firstName", "lastName", "avatar"],
                model: User,
                require: true
            }
        ],
        where: {
            type: "recharge",
            createdAt: {
              [Op.between]: [start, end],
            }
        },
    });
    result.rows = result.rows.map(function (row) {
        const {
            bonus,
            createdAt: date,
            point,
            unitPrice
        } = row;
        const {
            avatar,
            firstName,
            lastName
        } = row.Driver
        return Object.freeze({
            amount: calculateSolde(point, unitPrice),
            bonus,
            date,
            point,
            avatar,
            firstName,
            lastName
        });
    });
    return result;
};

Trans.getDriverBalance = async function balanceCalculator(driverId) {
    let result = await Trans.findAll({
        attributes: [
            "type",
            [fn("SUM", col("point")), "totalPoint"],
            [fn("SUM", literal("`point` * `unitPrice`" )), "totalAmount"],
            [fn("SUM", col("bonus")), "totalBonus"],
        ],
        group: ["type"],
        where: {driverId}
    });
    result = result.reduce(function (acc, entry) {
        let factor;
        const {type, totalPoint, totalAmount, totalBonus} = entry.dataValues;
        factor = (type === "recharge" ? 1 : -1);
        acc.bonus += factor * totalBonus;
        acc.point += factor * totalPoint;
        acc.solde += factor * totalAmount;
        return acc;
    }, { bonus: 0, point: 0, solde: 0});
    result.hasCredit = result.bonus >= 1 || result.point >= 1;
    return result;
};
Delivery.getDriverBalance = Trans.getDriverBalance;

module.exports = Object.freeze({
    Blacklist,
    Bundle,
    Delivery,
    DeliveryConflict,
    Message,
    Registration,
    Room,
    User,
    Transaction: Trans,
    Payment,
    Settings,
    UserRoom,
    connection,
    otpRequest
});
