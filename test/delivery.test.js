/*jslint
node, nomen
*/

const {
    after,
    afterEach,
    before,
    beforeEach,
    describe,
    it
} = require("mocha");
const {assert} = require("chai");
const {Delivery, User, connection} = require("../src/models");
const {
    clientSocketCreator,
    getToken,
    otpHandler,
    syncUsers,
    users
} = require("./fixtures/users.data");
const {
    badDelevery,
    deliveries,
    deliveryResquestor,
    setupDeliveryServer
} = require("./fixtures/deliveries.data");
const {errors} = require("../src/utils/config");

const {
    requestDelivery,
    setupDeliveryClosing
} = deliveryResquestor(getToken, Delivery);
describe("delivery CRUD test", function () {
    let server;
    let app;
    let dbUsers;

    before(function () {
        const tmp = setupDeliveryServer(otpHandler);
        server = tmp.server;
        app = tmp.app;
    });

    beforeEach(async function () {
        await connection.sync({force: true});
        dbUsers = await syncUsers(users, User);
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
});