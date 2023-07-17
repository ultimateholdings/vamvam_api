/*jslint
node, nomen
*/

require("dotenv").config();
const {
    afterEach,
    before,
    beforeEach,
    describe,
    it
} = require("mocha");
const supertest = require("supertest");
const {assert} = require("chai");
const {Delivery, User, connection} = require("../src/models");
const {buildServer} = require("../src");
const deliveryModule = require("../src/modules/delivery.module");
const buildDeliveryRoutes = require("../src/routes/delivery.route");
const buildRouter = require("../src/routes");
const {users} = require("./fixtures/users.data");
const { deliveries } = require("./fixtures/deliveries.data");
const buildAuthRoutes = require("../src/routes/auth.route");
const getAuthModule = require("../src/modules/auth.module");


describe("delivery CRUD test", function () {
    let server;
    let app;

    async function getToken(app, phoneNumber) {
        const response = await app.post("/auth/verify-otp").send({
            code: "1234",
            phoneNumber
        });
        return response.body.token;
    }

    before(async function () {
        let deliveryRoutes;
        const otpHandler = {
            sendCode: () => Promise.resolve({verified: true}),
            verifyCode: () => Promise.resolve({verified: true})
        };
        const authRoutes = buildAuthRoutes(getAuthModule({otpHandler}));
        deliveryRoutes = buildDeliveryRoutes(deliveryModule({}));
        server = buildServer(buildRouter({authRoutes, deliveryRoutes}));
        app = supertest.agent(server);
    });
    
    beforeEach(async function () {
        await connection.sync({force: true});
        await User.bulkCreate(Object.values(users));
    });

    afterEach(async function () {
        await connection.drop();
    });

    after(function () {
        server.close();
    });

    it("should create a new delivery", async function () {
        let client;
        let response;
        let token = await getToken(app, users.goodUser.phone);
        client = await User.findOne({where: {phone: users.goodUser.phone}});
        response = await app.post("/delivery/request").send(
            deliveries[0]
        ).set("authorization", "Bearer " + token);
        assert.equal(response.status, 200);
        response = await Delivery.findOne({where: {clientId: client.id}});
        assert.isNotNull(response);
    });
});