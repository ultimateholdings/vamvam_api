import "dotenv/config";
import express from "express";


const app = express();
const {API_PORT: port} = process.env
app.get("/", function (req, res) {
    res.send({message: "hello world from: " + req.url});
});
app.listen(port, function () {
    console.log("server listening to port %s", port);
});