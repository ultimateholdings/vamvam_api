/*jslint
node
*/
const {
    Blacklist,
    Bundle,
    Delivery,
    DeliveryConflict,
    Message,
    Payment,
    Registration,
    Room,
    Sponsor,
    Sponsorship,
    Transaction,
    User,
    UserRoom,
    connection,
    otpRequest
} = require("../models");

const interface = connection.getQueryInterface();

async function createTable(model) {
    const tableName = model.getTableName();
    const exists = await interface.tableExists(tableName);
    if (exists) {
        await model.sync({alter: true});
    } else {
        await interface.createTable(tableName, model.getAttributes());
    }
}

async function up() {
    await createTable(otpRequest);
    await createTable(User);
    await createTable(Delivery);
    await createTable(Room);
    await createTable(Message);
    await createTable(UserRoom);
    await createTable(DeliveryConflict);
    await createTable(Registration);
    await createTable(Blacklist);
    await createTable(Bundle);
    await createTable(Payment);
    await createTable(Transaction);
    await createTable(Sponsor);
    await createTable(Sponsorship);
}

async function down() {
    await interface.dropTable(otpRequest.getTableName());
    await interface.dropTable(User.getTableName());
    await interface.dropTable(Delivery.getTableName());
    await interface.dropTable(Room.getTableName());
    await interface.dropTable(UserRoom.getTableName());
    await interface.dropTable(Registration.getTableName());
    await interface.dropTable(Message.getTableName());
    await interface.dropTable(DeliveryConflict.getTableName());
    await interface.dropTable(Blacklist.getTableName());
    await interface.dropTable(Bundle.getTableName());
    await interface.dropTable(Payment.getTableName());
    await interface.dropTable(Transaction.getTableName());
    await interface.dropTable(Sponsor.getTableName());
    await interface.dropTable(Sponsorship.getTableName());
}

module.exports = Object.freeze({down, up});