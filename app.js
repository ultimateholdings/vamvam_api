const {buildServer} = require("./src");
const buildRoutes = require("./src/routes");
const {connection} = require("./src/models");

buildServer(buildRoutes({}));

(async function () {
    await connection.sync({alter: true});
})();