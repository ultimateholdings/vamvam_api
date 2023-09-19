const process = require("node:process");
const dotenv = require("dotenv");
const express = require("express");
let port;
dotenv.config();
port = process.env.API_PORT;
const staticUploadOptions = {
    dotfiles: "ignore",
    etag: false,
    extensions: ["pdf", "png", "jpg", "docx"],
    index: false,
    maxAge: "1d",
    redirect: false,
    setHeaders: function (res) {
        res.set("x-timestamp", Date.now());
    }
}
/*this is use to force passenger to use our designed port in production
because we will be using websocket
for more info checkout:
https://groups.google.com/d/msg/phusion-passenger/sZ4SjU8ypwc/MUdZMcnWq_8J
*/
function getPortHandlingPassenger(userPort) {
    const passengerPort = "passenger";
    const defaultPort = 1337;
    if (typeof PhusionPassenger !== "undefined") {
        PhusionPassenger.configure({autoInstall: false});
        return passengerPort;
    } else {
        return userPort || process.env.PORT || defaultPort;
    }

}
function buildServer(router) {
    const app = express();
    app.use(express.json());
    app.use(express.static("public", staticUploadOptions));
    app.use(router);
    return app.listen(getPortHandlingPassenger(port), function () {
        console.debug("server listening to port %s", port);
    });
}
module.exports = Object.freeze({
    buildServer
});