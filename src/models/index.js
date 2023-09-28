/*jslint node*/
const {Op, col, fn, where} = require("sequelize");
const {sequelizeConnection} = require("../utils/db-connector.js");
const {deliveryStatuses} = require("../utils/config.js");
const connection = sequelizeConnection();
const User = require("./user.js")(connection);
const otpRequest = require("./otp_request.js")(connection);
const Delivery = require("./delivery.js")(connection);
const Bundle = require("./bundle.js")(connection);
const Trans = require("./transaction.js")(connection);
const Payment = require("./payment.js")(connection);
const DeliveryConflict = require("./delivery-report.js")(connection);
const Registration = require("./driver-registration.js")(connection);
const Message = require("./message.model.js")(connection);
const Room = require("./room.model.js")(connection);
const UserRoom = require("./user_room.model.js")(connection);
const Blacklist = require("./blacklist.js")(connection);
const Settings = require("./settings.js")(connection);
const {Sponsor, Sponsorship} = require("./sponsor.js")({
    connection,
    model: User,
    name: "user"
});
const order = [["createdAt", "DESC"]];

Delivery.belongsTo(User, {
    as: "Driver",
    constraints: false,
    foreignKey: "driverId"
});
Delivery.belongsTo(User, {
    as: "Client",
    constraints: false,
    foreignKey: "clientId"
});
Bundle.hasOne(Payment, {
    as: "Pack",
    constraints: false,
    foreignKey: "packId"
})
User.hasOne(Payment, {
    as: "Driver",
    constraints: false,
    foreignKey: "driverId"
})
Trans.belongsTo(User, {
    as: "Driver",
    constraints: false,
    foreignKey: "driverId"
});
DeliveryConflict.belongsTo(User, {
    as: "Assigner",
    constraints: false,
    foreignKey: "assignerId"
});
DeliveryConflict.belongsTo(User, {
    as: "Reporter",
    constraints: false,
    foreignKey: "reporterId"
});
DeliveryConflict.belongsTo(Delivery, {
    as: "Delivery",
    constraints: false,
    foreignKey: "deliveryId"
});
DeliveryConflict.belongsTo(User, {
    as: "backupDriver",
    constraints: false,
    foreignKey: "assigneeId"
});
Delivery.belongsTo(DeliveryConflict, {
    as: "Conflict",
    constraints: false,
    foreignKey: "conflictId"
});
Registration.belongsTo(User, {
    as: "contributor",
    constraints: false,
    foreignKey: "contributorId"
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
Settings.forward("user-revocation-requested").to(Delivery);

function formatRoomMessage(row) {
    const {content, createdAt, id, room, sender} = row;
    return Object.freeze({
        content,
        date: createdAt.toISOString(),
        id,
        room: room.toResponse(),
        sender: sender.toShortResponse()
    });
}
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
            {model: Room, required: true}
        ],
        limit: (offset > 0 ? maxSize + 1: maxSize),
        offset: (offset > 0 ? offset - 1: offset),
        order
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
        values: results.rows.map(formatRoomMessage)
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
        const {room} = row;
        if (acc[room.id] === undefined) {
            acc[room.id] = {
                count: 0,
                messages: [],
                roomName: room.name
            };
        }
        acc[room.id].count += 1;
        acc[room.id].messages.push(formatRoomMessage(row));
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
                    attributes: ["id", "content", "createdAt", "senderId"],
                    include: [
                        {
                            as: "sender",
                            model: User,
                            required: false,
                        },
                    ],
                    limit: 1,
                    model: Message,
                    order,
                    required: true,
                },
                {model: User, required: true},
                {model: Delivery, required: true}
            ]
        },
        where: {id: userId}
    });
    return result.rooms.map(function (room) {
        let delivery = room.delivery.toResponse();
        const result = {
            createdAt: room.createdAt.toISOString(),
            id: room.id,
            delivery: {
                departure: delivery.departure.address ?? "",
                destination: delivery.destination.address ?? "",
                id: delivery.id
            },
            members: room.users.map((user) => user.toShortResponse()),
            name: room.name
        };
        const messages = room.Messages.map(function (msg) {
            msg.room = room;
            return formatRoomMessage(msg);
        });
        if (messages.length > 0) {
            result.lastMessage = messages[0];
        }
        return result;
    });
}

function getDeliveries({clause, limit, offset, order}) {
    const include = [
        {as: "Client", model: User, required: true},
        {as: "Driver", model: User, required: true},
        {as: "Conflict", model: DeliveryConflict, required: false}
    ];
    return Delivery.findAll({
        include,
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
                    {"$Conflict.assigneeId$": {[Op.eq]: userId}},
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
    return getDeliveries({clause, order})
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
                    {"$Conflict.assigneeId$": {[Op.eq]: userId}},
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
        order,
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
Trans.getAllByTime= async function ({limit, offset, start, end, type}) {
    let result;
    result = await Trans.findAndCountAll({
        include: [
            {
                as: "Driver",
                attributes: ["id", "firstName", "lastName", "avatar"],
                model: User,
                require: true
            }
        ],
        limit,
        offset,
        order,
        where: {
            type: type,
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
            amount: point * unitPrice,
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
Delivery.getDeliveryDetails = async function (id) {
    const deliveries = await getDeliveries({clause: {id}});
    return deliveries[0];
}

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
    Sponsor,
    Sponsorship,
    UserRoom,
    connection,
    otpRequest
});
