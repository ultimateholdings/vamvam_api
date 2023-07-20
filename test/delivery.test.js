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
const {
    clientSocketCreator,
    getToken,
    otpHandler,
    users
} = require("./fixtures/users.data");
const {badDelevery, deliveries} = require("./fixtures/deliveries.data");
const buildAuthRoutes = require("../src/routes/auth.route");
const getAuthModule = require("../src/modules/auth.module");
const getSocketManager = require("../src/utils/socket-manager");
const {errors} = require("../src/utils/config");

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

describe("delivery CRUD test", function () {
    let server;
    let app;
    let dbUsers;
    let socketServer;
    let socketGenerator = clientSocketCreator("delivery");

    before(function () {
        let deliveryRoutes;
        const authRoutes = buildAuthRoutes(getAuthModule({otpHandler}));
        deliveryRoutes = buildDeliveryRoutes(deliveryModule({}));
        server = buildServer(buildRouter({authRoutes, deliveryRoutes}));
        app = supertest.agent(server);
        socketServer = getSocketManager({
            deliveryModel: Delivery,
            httpServer: server,
        });
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
        socketServer.io.close();
    });

    async function setupDeliveryClosing({
        app,
        clientPhone,
        delivery,
        driverData
    }) {
        const request = await requestDelivery(
            app,
            clientPhone,
            delivery
        );
        let token = await getToken(app, driverData.phone);
        await Delivery.update({driverId: driverData.id}, {
            where: {id: request.id}
        });
        return {driverToken: token, request};
    }

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
        assert.equal(response.status, errors.invalidLocation.status);
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
        assert.equal(response.status, errors.invalidValues.status);
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
            assert.equal(response.status, errors.notAuthorized.status);
            response = await app.get("/delivery/infos").send({
                id: goodUserRequest.id
            }).set("authorization", "Bearer " + secondUserRequest.token);
            assert.equal(response.status, errors.notAuthorized.status);
        }
    );

    it(
        "should terminate a delivery when a verification code is correct",
        async function () {
            const {request, driverToken} = await setupDeliveryClosing({
                app,
                clientPhone: dbUsers.goodUser.phone,
                delivery: deliveries[0],
                driverData: dbUsers.firstDriver
            });
            response = await app.post("/delivery/verify-code").send({
                code: "1234590900",
                id: request.id
            }).set("authorization", "Bearer " + driverToken);
            assert.equal(response.status, errors.invalidValues.status);
            response = await app.post("/delivery/verify-code").send({
                code: request.code,
                id: request.id
            }).set("authorization", "Bearer " + driverToken);
            assert.equal(response.status, 200);
            response = await Delivery.findOne({
                where: {id: request.id}
            });
            assert.equal(response.status, "terminated");
        }
    );

    it(
        "should only allow the delivery driver to verify code",
        async function () {
            //Note: goodUser is a client so he cannot verify the code
            let response;
            const {request} = await setupDeliveryClosing({
                app,
                clientPhone: dbUsers.goodUser.phone,
                delivery: deliveries[0],
                driverData: dbUsers.firstDriver
            });
            const secondDriverToken = await getToken(
                app,
                dbUsers.secondDriver.phone
            );
            response = await app.post("/delivery/verify-code").send({
                code: request.code,
                id: request.id
            }).set("Authorization", "Bearer " + request.token);
            assert.equal(response.status, errors.notAuthorized.status);
            response = await app.post("/delivery/verify-code").send(
                request
            ).set("Authorization", "Bearer " + secondDriverToken);
            assert.equal(response.status, errors.notAuthorized.status);
        }
    );

    it(
        "should not verify a delivery which isn't in started status",
        async function () {
            let response;
            const {request, driverToken} = await setupDeliveryClosing({
                app,
                clientPhone: dbUsers.goodUser.phone,
                delivery: deliveries[0],
                driverData: dbUsers.firstDriver
            });
            await Delivery.update({
                status: "terminated",
                driverId: dbUsers.firstDriver.id
            }, {where: {id: request.id}});
            response = await app.post("/delivery/verify-code").send(
                request
            ).set("Authorization", "Bearer " + driverToken);
            assert.equal(response.status, errors.cannotPerformAction.status);
        }
    );

    it("should notify the client on delivery's ending", function (done) {
        setupDeliveryClosing({
            app,
            clientPhone: dbUsers.goodUser.phone,
            delivery: deliveries[0],
            driverData: dbUsers.firstDriver
        }).then(function ({driverToken, request}) {
            return socketGenerator(request.token).then(function (client) {
                    return {client, driverToken, request};
            });
        }).then(function ({client, driverToken, request}) {
            app.post("/delivery/verify-code").send(
                request
                ).set("authorization", "Bearer " + driverToken).then(
                    function () {
                        client.on("delivery-end", function (data) {
                            assert.equal(data.deliveryId, request.id);
                            done();
                            client.close();
                        });
                    });
            }).catch(console.error);
    });
});