const {Umzug, SequelizeStorage} = require("umzug");
const {buildServer} = require("./src");
const buildRoutes = require("./src/routes");
const {connection} = require("./src/models");
const umzug = new Umzug({
    context: connection.getQueryInterface(),
    migrations: {glob: "src/migrations/*.js"},
    logger: console,
    storage: new SequelizeStorage({sequelize: connection})
});
buildServer(buildRoutes({}));

(async function () {
    await umzug.up();
})();