/*jslint
node
*/
const defineUserModel = require("./user.model.js");
const otpModel = require("./otp_request.js");
const defineDeliveryModel = require("./delivery.js");
const defineRoomModel = require("./room.model");
const defineMessageModel = require("./message.model.js");
const defineUserRoomModel = require("./user_room.model.js");
const {sequelizeConnection} = require("../utils/db-connector.js");
const connection = sequelizeConnection();
const Delivery = defineDeliveryModel(connection);
const User = defineUserModel(connection);
const otpRequest = otpModel(connection);
const Message = defineMessageModel(connection);
const Room = defineRoomModel(connection);
const UserRoom =  defineUserRoomModel(connection);

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
User.hasMany(Message, { foreignKey: "senderId" });
Message.belongsTo(User, { foreignKey: "senderId" })
Room.belongsToMany(User, { through: UserRoom });
User.belongsToMany(Room, { through: UserRoom });
Room.hasMany(Message, { foreignKey: "roomId"});
Message.belongsTo(Room, { foreignKey: "roomId"});

module.exports = Object.freeze({
    Delivery,
    Message,
    Room,
    User,
    connection,
    otpRequest
});
