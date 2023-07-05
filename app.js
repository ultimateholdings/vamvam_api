const {buildServer} = require("./src");
const buildRoutes = require("./src/routes");

buildServer(buildRoutes({}));
