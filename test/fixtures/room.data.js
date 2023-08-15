require("dotenv").config();
const supertest = require("supertest");
const { buildServer } = require("../../src");
const roomModule = require("../../src/modules/room.module");
const buildRoomRoutes = require("../../src/routes/room.route");
const buildRouter = require("../../src/routes");
const buildAuthRoutes = require("../../src/routes/auth.route");
const getAuthModule = require("../../src/modules/auth.module");

const rooms = [
    {
      name: "livraison pour bonandjo."
    },
    {
      name: "Livraison pour Bali"
    },
    {
      name: "Livraison pour djebale"
    },
    {
      name: "Livraison pour Mambanda"
    },
];
function roomHandler(tokenGetter){
    async function postRoom({app, data, phone, url}){
        let token = await tokenGetter(app, phone );
        let response = await app.post(url).send(
            data
        ).set("authorization", "Bearer " + token);
        return {response, token}
    };
    async function createRoom({
        app,
        data,
        phone
    }){
        let {response, token} = await postRoom({
            app,
            data,
            phone,
            url: "/room/new-room"
        });
        response.body.token = token;
        response.body.status = response.status;
        return response.body;
};
    return Object.freeze({createRoom});
};
function setupRoomServer(otpHandler){
    let roomRoutes;
    let app;
    let server;
    const authRoutes = buildAuthRoutes(getAuthModule({otpHandler}));
    roomRoutes = buildRoomRoutes(roomModule({}));
    server = buildServer(buildRouter({authRoutes, roomRoutes}));
    app = supertest.agent(server);
    return Object.freeze({app, server});
};
module.exports = Object.freeze({
    rooms,
    roomHandler,
    setupRoomServer
});