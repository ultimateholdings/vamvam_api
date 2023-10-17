/*jslint node*/
require("dotenv").config();
const process = require("process");
const {SequelizeStorage, Umzug} = require("umzug");
const {buildServer} = require("./src");
const buildRoutes = require("./src/routes");
const {Delivery, Settings, connection} = require("./src/models");
const getSocketManager = require("./src/utils/socket-manager");
const getDeliveryHandler = require("./src/modules/delivery.socket-handler");
const registrationHandler = require("./src/modules/driver.socket-handler");
const confictHandler = require("./src/modules/conflict.socket-handler");
const umzug = new Umzug({
    context: connection.getQueryInterface(),
    logger: console,
    migrations: {glob: "src/migrations/*.js"},
    storage: new SequelizeStorage({sequelize: connection})
});
const httpServer = buildServer(buildRoutes({}));
const socketServer = getSocketManager({
    conflictHandler: confictHandler(Delivery),
    deliveryHandler: getDeliveryHandler(Delivery),
    httpServer,
    registrationHandler: registrationHandler(Delivery)
});
const createMailer = require("./src/utils/email-handler");
const mailer = createMailer();

function format(error) {
    const result = Object.create(null);
    result.name = error.name;
    result.stackTrace = error.stack;
    result.message = error.message;
    return Object.freeze(result);
}

(async function () {
    let settings;
    await umzug.up();
    settings = await Settings.getAll();
    settings.forEach(function ({type, value}) {
        Settings.emitEvent("settings-update", {type, value});
    });
}());

process.on("uncaughtException", function (error) {
    const {admin_email} = process.env;
    const text = JSON.stringify(format(error), null, 4);
    const mailTemplate = mailer.getEmailTemplate({
        content: "<code>" + text + "</code>"
    });
    socketServer.close();
    httpServer.close();
    mailer.sendEmail({
        callback: mailer.handleResponse,
        html: mailTemplate(),
        text,
        to: admin_email
    });
});