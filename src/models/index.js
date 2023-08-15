/*jslint
node
*/
const defineUserModel = require("./user.js");
const otpModel = require("./otp_request.js");
const defineDeliveryModel = require("./delivery.js");
const defineReportModel = require("./delivery-report.js");
const defineRegistration = require("./driver-registration.js");
const defineRoomModel = require("./room.model");
const defineMessageModel = require("./message.model.js");
const defineUserRoomModel = require("./user_room.model.js");
const {sequelizeConnection} = require("../utils/db-connector.js");
const connection = sequelizeConnection();
const User = defineUserModel(connection);
const otpRequest = otpModel(connection);
const Delivery = defineDeliveryModel(connection);
const DeliveryConflict = defineReportModel(connection);
const Registration = defineRegistration(connection);
const Message = defineMessageModel(connection);
const Room = defineRoomModel(connection);
const UserRoom = defineUserRoomModel(connection);

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
Message.belongsTo(User, {foreignKey: "senderId"});
Room.belongsToMany(User, {through: UserRoom});
User.belongsToMany(Room, {through: UserRoom});
Room.hasMany(Message, {foreignKey: "roomId"});
Message.belongsTo(Room, {foreignKey: "roomId"});

Message.getAllByRoom = async function ({limit, offset, roomId}) {
    const result = await Message.findAndCountAll({
        include: [
            {
                attributes: ["id", "firstName", "lastName", "avatar"],
                model: User
            }
        ],
        limit,
        offset,
        order: [["createdAt", "DESC"]],
        where: {roomId}
    });
    result.rows = result.rows.map(function (row) {
        const {
            content,
            createdAt: date,
            id: messageId,
            user
        } = row;
        return Object.freeze({
            content,
            date,
            messageId,
            sender: user.toShortResponse()
        });
    });
    return result;
};

module.exports = Object.freeze({
    Delivery,
    DeliveryConflict,
    Message,
    Registration,
    Room,
    User,
    connection,
    otpRequest
});
