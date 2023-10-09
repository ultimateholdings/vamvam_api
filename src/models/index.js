/*jslint node*/
const {Op, col, fn, where} = require("sequelize");
const {sequelizeConnection} = require("../utils/db-connector.js");
const connection = sequelizeConnection();
const User = require("./user.js")(connection);
const otpRequest = require("./otp_request.js")(connection);
const {delivery, conflict} = require("./delivery.js")(connection, User);
const Bundle = require("./bundle.js")(connection);
const Trans = require("./transaction.js")(connection);
const Payment = require("./payment.js")(connection);
const Registration = require("./driver-registration.js")(connection);
const roomModels = require("./room.model.js")(connection, User, delivery);
const Blacklist = require("./blacklist.js")(connection);
const Settings = require("./settings.js")(connection);
const {Sponsor, Sponsorship} = require("./sponsor.js")({
    connection,
    model: User,
    name: "user"
});
const order = [["createdAt", "DESC"]];

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

Registration.belongsTo(User, {
    as: "contributor",
    constraints: false,
    foreignKey: "contributorId"
});

User.getSettings = delivery.getSettings;

Settings.addEventListener("settings-update", function (data) {
    if(data.type === "delivery") {
        delivery.setSettings(data.value);
    }
    if (data.type === "otp") {
        otpRequest.setSettings(data.value);
    }
});
Settings.forward("user-revocation-requested").to(delivery);
Registration.forward("new-registration").to(delivery);
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

delivery.getDriverBalance = Trans.getDriverBalance;
module.exports = Object.freeze({
    Blacklist,
    Bundle,
    Delivery: delivery,
    DeliveryConflict: conflict,
    Message: roomModels.message,
    Registration,
    Room: roomModels.room,
    User,
    Transaction: Trans,
    Payment,
    Settings,
    Sponsor,
    Sponsorship,
    UserRoom: roomModels.userJoin,
    connection,
    otpRequest
});
