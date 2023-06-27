import express from "express";


const app = express();
app.get("/", function (req, res) {
    res.send({message: "hello world from: " + req.url});
});
app.listen(3000);