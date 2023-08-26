const process = require("process");
const {Umzug, SequelizeStorage} = require("umzug");
const {buildServer} = require("./src");
const buildRoutes = require("./src/routes");
const {connection, Delivery} = require("./src/models");
const getSocketManager = require("./src/utils/socket-manager");
const getDeliveryHandler = require("./src/modules/delivery.socket-handler");
const registrationHandler = require("./src/modules/driver.socket-handler");
const confictHandler = require("./src/modules/conflict.socket-handler");
const umzug = new Umzug({
    context: connection.getQueryInterface(),
    migrations: {glob: "src/migrations/*.js"},
    logger: console,
    storage: new SequelizeStorage({sequelize: connection})
});
const httpServer = buildServer(buildRoutes({}));
const socketServer = getSocketManager({
    conflictHandler: confictHandler(Delivery),
    deliveryHandler: getDeliveryHandler(Delivery),
    httpServer,
    registrationHandler: registrationHandler(Delivery)
});
(async function () {
    await umzug.up();
})();

process.on("uncaughtException", function (error) {
    console.dir(error);
    socketServer.close();
    httpServer.close();
    //TODO: notify via email
});