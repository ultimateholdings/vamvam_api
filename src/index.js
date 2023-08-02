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

function buildServer(router) {
    const app = express();
    app.use(express.json());
    app.use(express.static("public", staticUploadOptions));
    app.use(router);
    return app.listen(port, function () {
        console.log("server listening to port %s", port);
    });
}
module.exports = Object.freeze({
    buildServer
});