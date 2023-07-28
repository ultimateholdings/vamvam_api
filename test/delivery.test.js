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
const {errors, availableRoles: roles} = require("../src/utils/config");

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


    it("should return a 440 status on invalid location", async function () {
        let response = await requestDelivery({
            app,
            phone: dbUsers.goodUser.phone,
            data: badDelevery
        });
        assert.equal(response.status, errors.invalidLocation.status);
    });

    it("should provide the infos of a delivery", async function () {
        const goodUserRequest = await requestDelivery({
            app,
            phone: dbUsers.goodUser.phone,
            data: deliveries[0]
        });
        let response = await app.get("/delivery/infos").send({
            id: null
        }).set("authorization", "Bearer " + goodUserRequest.token);
        assert.equal(response.status, errors.notFound.status);
        response = await app.get("/delivery/infos").send({
            id: goodUserRequest.id
        }).set("authorization", "Bearer " + goodUserRequest.token);
        assert.equal(response.status, 200);
        assert.equal(response.body.client.phone, dbUsers.goodUser.phone);
    });

    it(
        "should not allow a client to fetch another one's delivery",
        async function () {
            const goodUserRequest = await requestDelivery({
                app,
                phone: dbUsers.goodUser.phone,
                data: deliveries[0]
            });
            const secondUserRequest = await requestDelivery({
                app,
                phone: dbUsers.firstDriver.phone,
                data: deliveries[1]
            });
            let response = await app.get("/delivery/infos").send({
                id: secondUserRequest.id
            }).set("authorization", "Bearer " + goodUserRequest.token);
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
            assert.equal(response.status, errors.invalidCode.status);
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
            }).set("authorization", "Bearer " + request.token);
            assert.equal(response.status, errors.notAuthorized.status);
            response = await app.post("/delivery/verify-code").send(
                request
            ).set("authorization", "Bearer " + secondDriverToken);
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
            ).set("authorization", "Bearer " + driverToken);
            assert.equal(response.status, errors.cannotPerformAction.status);
        }
    );

    describe("delivery state mutation tests", function () {
        let request;
        let driverToken;
        beforeEach(async function() {
            request = await requestDelivery({
                app,
                data: deliveries[0],
                phone: dbUsers.goodUser.phone
            });
            driverToken = await getToken(
                app,
                dbUsers.firstDriver.phone
            );
        })
        it("should aprove a delivery request", async function () {
            const token2 = await getToken(app, dbUsers.secondDriver.phone);
            let response = await app.post("/delivery/accept").send({
                id: request.id
            }).set("authorization", "Bearer " + driverToken);
            assert.equal(response.status, 200);
            response = await app.post("/delivery/accept").send({
                id: request.id
            }).set("authorization", "Bearer " + token2);
            assert.equal(response.status, errors.alreadyAssigned.status);
        });
    
        it(
            "should not approve a delivery if it's been cancelled",
            async function () {
                let response = await app.post("/delivery/cancel").send({
                    id: request.id
                }).set("authorization", "Bearer " + request.token);
                assert.equal(response.status, 200);
                response = await app.post("/delivery/accept").send({
                    id: request.id
                }).set("authorization", "Bearer " + driverToken);
                assert.equal(response.status, errors.alreadyCancelled.status);
            }
        );
    
        it("should signal the package reception", async function () {
            let response;
            await Delivery.update({driverId: dbUsers.firstDriver.id}, {
                where: {id: request.id}
            });
            response = await app.post("/delivery/signal-reception").send({
                id: request.id
            }).set("authorization", "Bearer " + driverToken);
            assert.equal(response.status, errors.cannotPerformAction.status);
            await Delivery.update({status: Delivery.statuses.pendingReception}, {
                where: {id: request.id}
            });
            response = await app.post("/delivery/signal-reception").send({
                id: request.id
            }).set("authorization", "Bearer " + driverToken);
            assert.equal(response.status, 200);
            response = await Delivery.findOne({where: {id: request.id}});
            assert.equal(response.status, Delivery.statuses.toBeConfirmed);
        });

        it("should confirm package deposit", async function () {
            let response;
            await Delivery.update({
                driverId: dbUsers.firstDriver.id,
                status: Delivery.statuses.pendingReception,
            }, {where: {id: request.id}});
            response = await app.post("/delivery/confirm-deposit").send({
                id: request.id
            }).set("authorization", "Bearer " + request.token);
            assert.equal(response.status, errors.cannotPerformAction.status);
            await app.post("/delivery/signal-reception").send({
                id: request.id
            }).set("authorization", "Bearer " + driverToken);
            response = await app.post("/delivery/confirm-deposit").send({
                id: request.id
            }).set("authorization", "Bearer " + request.token);
            assert.equal(response.status, 200);
            response = await Delivery.findOne({where: {id: request.id}});
            assert.equal(response.status, Delivery.statuses.started);
            assert.isNotNull(response.begin)
        });
    });

});