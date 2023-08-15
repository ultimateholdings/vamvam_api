require("dotenv").config();
const supertest = require("supertest");
const { buildServer } = require("../../src");
const messageModule = require("../../src/modules/message.module");
const buildMessageRoutes = require("../../src/routes/message.route");
const buildRouter = require("../../src/routes");
const buildAuthRoutes = require("../../src/routes/auth.route");
const getAuthModule = require("../../src/modules/auth.module");
const chatModule = require("../../src/modules/chat.module");
const chatRoute = require("../../src/routes/chat.route");

const messages = [
  {
    content:
      "Bonjour Mr Tankoua, Je m'appelle christian livreur vamvam, j'ai recu une demande de livraison pour bonandjo."
  },
  {
    content: "Merci bonjour, je suis situe a litto labo, vallee bessingue"
  },
  {
    content: "Je suis point de recption du coli!"
  },
  {
    content: "J'arrive dans une minute."
  },
];

function messageHandler(tokenGetter){
    async function postMessage({app, data, phone, url}){
        let token = await tokenGetter(app, phone );
        let response = await app.post(url).send(
            data
        ).set("authorization", "Bearer " + token);
        return {response, token}
    };
    async function sendMessage({
        app,
        data,
        phone
    }){
        let {response, token} = await postMessage({
            app,
            data,
            phone,
            url: "/discussion/new-message"
        });
        response.body.token = token;
        response.body.status = response.status;
        return response.body;
    };
    return Object.freeze({sendMessage});
};

function setupMessageServer(otpHandler){
    let app;
    let server;
    const authRoutes = buildAuthRoutes(getAuthModule({otpHandler}));
    server = buildServer(buildRouter({authRoutes}));
    app = supertest.agent(server);
    return Object.freeze({app, server});
};

module.exports = Object.freeze({
    messages,
    messageHandler,
    setupMessageServer
});