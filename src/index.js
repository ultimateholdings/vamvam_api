const dotenv = require("dotenv");
const express = require("express");
let port;
dotenv.config();
port = process.env.API_PORT;

function buildServer(router) {
    const app = express();
    app.use(express.json());
    app.use(router);
    return app.listen(port, function () {
        console.log("server listening to port %s", port);
    });
}
module.exports = Object.freeze({
    buildServer
});