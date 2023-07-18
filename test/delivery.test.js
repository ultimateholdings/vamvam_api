/*jslint
node, nomen
*/

require("dotenv").config();
const {
    after,
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
const {badDelevery, deliveries} = require("./fixtures/deliveries.data");
const buildAuthRoutes = require("../src/routes/auth.route");
const getAuthModule = require("../src/modules/auth.module");


describe("delivery CRUD test", function () {
    let server;
    let app;
    let dbUsers;

    async function getToken(app, phoneNumber) {
        const response = await app.post("/auth/verify-otp").send({
            code: "1234",
            phoneNumber
        });
        return response.body.token;
    }

    async function requestDelivery(app, phone, data) {
        let token = await getToken(app, phone);
        let response = await app.post("/delivery/request").send(
            data
        ).set("authorization", "Bearer " + token);
        if (response.body.id !== undefined) {
            await Delivery.update({status: "started"}, {
                where: {id: response.body.id}
            });
        }
        response.body.token = token;
        response.body.status = response.status;
        return response.body;
    }

    before(function () {
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
        const phoneMap = Object.entries(users).reduce(
            function (acc, [key, val]) {
                acc[val.phone] = key;
                return acc;
            },
            {}
        );
        await connection.sync({force: true});
        dbUsers = await User.bulkCreate(Object.values(users));
        dbUsers = dbUsers.reduce(function (acc, user) {
            acc[phoneMap[user.phone]] = user;
            return acc;
        }, {});
    });

    afterEach(async function () {
        await connection.drop();
    });

    after(function () {
        server.close();
    });

    it("should create a new delivery", async function () {
        let response = await requestDelivery(
            app,
            users.goodUser.phone,
            deliveries[0]
        );
        assert.equal(response.status, 200);
        response = await Delivery.findOne({
            where: {clientId: dbUsers.goodUser.id}
        });
        assert.isNotNull(response);
    });

    it("should return a 440 status on invalid location", async function () {
        let response = await requestDelivery(
            app,
            dbUsers.goodUser.phone,
            badDelevery
        );
        assert.equal(response.status, 440);
    });

    it("should provide the infos of a delivery", async function () {
        const goodUserRequest = await requestDelivery(
            app,
            dbUsers.goodUser.phone,
            deliveries[0]
        );
        let response = await app.get("/delivery/infos").send({
            id: null
        }).set("authorization", "Bearer " + goodUserRequest.token);
        assert.equal(response.status, 440);
        response = await app.get("/delivery/infos").send({
            id: goodUserRequest.id
        }).set("authorization", "Bearer " + goodUserRequest.token);
        assert.equal(response.status, 200);
        assert.equal(response.body.client.phone, dbUsers.goodUser.phone);
    });

    it(
        "should not allow a client to fetch another one's delivery",
        async function () {
            const goodUserRequest = await requestDelivery(
                app,
                dbUsers.goodUser.phone,
                deliveries[0]
            );
            const secondUserRequest = await requestDelivery(
                app,
                dbUsers.firstDriver.phone,
                deliveries[1]
            );
            let response = await app.get("/delivery/infos").send({
                id: secondUserRequest.id
            }).set("authorization", "Bearer " + goodUserRequest.token);
            assert.equal(response.status, 401);
            response = await app.get("/delivery/infos").send({
                id: goodUserRequest.id
            }).set("authorization", "Bearer " + secondUserRequest.token);
            assert.equal(response.status, 401);
        }
    );

    it(
        "should terminate a delivery when a verification code is correct",
        async function () {
            const goodUserRequest = await requestDelivery(
                app,
                dbUsers.goodUser.phone,
                deliveries[0]
            );
            let response;
            let token = await getToken(app, dbUsers.firstDriver.phone);
            await Delivery.update({driverId: dbUsers.firstDriver.id}, {
                where: {id: goodUserRequest.id}
            });
            response = await app.post("/delivery/verify-code").send({
                code: "1234590900",
                id: goodUserRequest.id
            }).set("authorization", "Bearer " + token);
            assert.equal(response.status, 400);
            response = await app.post("/delivery/verify-code").send({
                code: goodUserRequest.code,
                id: goodUserRequest.id
            }).set("authorization", "Bearer " + token);
            assert.equal(response.status, 200);
            response = await Delivery.findOne({
                where: {id: goodUserRequest.id}
            });
            assert.equal(response.status, "terminated");
        }
    );

    it(
        "should only allow the delivery driver to verify code",
        async function () {
            //Note: goodUser is a client so he cannot verify the code
            let response;
            const goodUserRequest = await requestDelivery(
                app,
                dbUsers.goodUser.phone,
                deliveries[0]
            );
            const secondDriverToken = await getToken(
                app,
                dbUsers.secondDriver.phone
            );
            await Delivery.update(
                {driverId: dbUsers.firstDriver.id},
                {where: {id: goodUserRequest.id}}
            );
            response = await app.post("/delivery/verify-code").send({
                code: goodUserRequest.code,
                id: goodUserRequest.id
            }).set("Authorization", "Bearer " + goodUserRequest.token);
            assert.equal(response.status, 401);
            response = await app.post("/delivery/verify-code").send(
                goodUserRequest
            ).set("Authorization", "Bearer " + secondDriverToken);
            assert.equal(response.status, 401);
        }
    );

    it(
        "should not verify a delivery which isn't in started status",
        async function () {
            let response;
            const goodUserRequest = await requestDelivery(
                app,
                dbUsers.goodUser.phone,
                deliveries[0]
            );
            const firstDriverToken = await getToken(
                app,
                dbUsers.firstDriver.phone
            );
            await Delivery.update({
                status: "terminated",
                driverId: dbUsers.firstDriver.id
            }, {where: {id: goodUserRequest.id}});
            response = await app.post("/delivery/verify-code").send(
                goodUserRequest
            ).set("Authorization", "Bearer " + firstDriverToken);
            assert.equal(response.status, 454);
        }
    );
});