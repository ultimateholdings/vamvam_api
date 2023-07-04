const dotenv = require("dotenv");
const express =  require("express");
const path = require("path");
const bodyParser = require("body-parser");
const Routes = require("./src/routes/index.js");
const database = require("./src/config/database.js");

const app = express();
dotenv.config({path: "./.env"});
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.get("/", function (req, res) {
    res.send({message: "hello world from: " + req.url});
});

app.use(Routes);
database.sync({ alter: true })
.then(console.log("Connexion á la base de donné!!"))
.catch((error)=> console.log("Erreur de connexion á la base de donné: ", error));
app.listen(process.env.API_PORT, function () {
    console.log("server listening to port %s", process.env.API_PORT);
});