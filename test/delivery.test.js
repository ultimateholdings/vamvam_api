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
const {
    Delivery,
    DeliveryConflict,
    User,
    connection
} = require("../src/models");
const {
    loginUser,
    getToken,
    otpHandler,
    syncUsers,
    users
} = require("./fixtures/helper");
const {
    badDelevery,
    deliveries,
    deliveryResquestor,
    missoke,
    setupDeliveryServer
} = require("./fixtures/deliveries.data");
const {
    deliveryStatuses,
    errors
} = require("../src/utils/config");
const {toDbPoint} = require("../src/utils/helpers");

const {
    requestDelivery,
    setupDelivery
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
            data: badDelevery,
            phone: dbUsers.goodUser.phone
        });
        assert.equal(response.status, errors.invalidLocation.status);
    });

    it("should provide the infos of a delivery", async function () {
        const goodUserRequest = await requestDelivery({
            app,
            data: deliveries[0],
            phone: dbUsers.goodUser.phone
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
                data: deliveries[0],
                phone: dbUsers.goodUser.phone
            });
            const secondUserRequest = await requestDelivery({
                app,
                data: deliveries[1],
                phone: dbUsers.firstDriver.phone
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
            let response;
            const {driverToken, request} = await setupDelivery({
                app,
                clientPhone: dbUsers.goodUser.phone,
                delivery: deliveries[0],
                driverData: dbUsers.firstDriver,
                initialState: deliveryStatuses.started
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

    it("should allow a rate a delivery once terminated", async function () {
        let response;
        const {driverToken, request} = await setupDelivery({
            app,
            clientPhone: dbUsers.goodUser.phone,
            delivery: deliveries[0],
            driverData: dbUsers.firstDriver,
            initialState: deliveryStatuses.started
        });
        response = await app.post("/delivery/rate").send({
            id: request.id,
            note: 4
        }).set("authorization", "Bearer " + request.token);
        assert.equal(response.status, errors.cannotPerformAction.status);
        await app.post("/delivery/verify-code").send({
            code: request.code,
            id: request.id
        }).set("authorization", "Bearer " + driverToken);
        response = await app.post("/delivery/rate").send({
            id: request.id,
            note: 4
        }).set("authorization", "Bearer " + request.token);
        assert.equal(response.status, 200);
        response = await app.post("/delivery/rate").send({
            id: request.id,
            note: 4
        }).set("authorization", "Bearer " + request.token);
        assert.equal(response.status, errors.alreadyRated.status);

    });

    it(
        "should only allow the delivery driver to verify code",
        async function () {
            //Note: goodUser is a client so he cannot verify the code
            let response;
            const {request} = await setupDelivery({
                app,
                clientPhone: dbUsers.goodUser.phone,
                delivery: deliveries[0],
                driverData: dbUsers.firstDriver,
                initialState: deliveryStatuses.started
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
            const {driverToken, request} = await setupDelivery({
                app,
                clientPhone: dbUsers.goodUser.phone,
                delivery: deliveries[0],
                driverData: dbUsers.firstDriver,
                initialState: deliveryStatuses.terminated
            });
            response = await app.post("/delivery/verify-code").send(
                request
            ).set("authorization", "Bearer " + driverToken);
            assert.equal(response.status, errors.cannotPerformAction.status);
        }
    );

    it("should enable a manager to archive a conflict", async function () {
        const endPoint = "/delivery/conflict/archive";
        const token = await loginUser(
            app,
            dbUsers.conflictManager.phone,
            "aSimplePass"
        );
        let response;
        const {request} = await setupDelivery({
            app,
            clientPhone: dbUsers.goodUser.phone,
            delivery: deliveries[0],
            driverData: dbUsers.firstDriver,
            initialState: deliveryStatuses.inConflict
        });
        const conflict = await DeliveryConflict.create({
            deliveryId: request.id,
            type: "Package damaged",
            lastLocation: toDbPoint(missoke)
        });
        response = await app.post(endPoint).send({
            id: conflict.id
        }).set("authorization", "Bearer " + token);
        assert.equal(response.status, 200);
        response = await app.post(endPoint).send({
            id: conflict.id
        }).set("authorization", "Bearer " + token);
        assert.equal(response.status, errors.cannotPerformAction.status);
    });

    it("should provide the list of nearby drivers", async function () {
        const token = await loginUser(
            app,
            dbUsers.conflictManager.phone,
            "aSimplePass"
        );
        let response;
        dbUsers.firstDriver.position = toDbPoint(deliveries[0].departure);
        dbUsers.firstDriver.available = false;
        dbUsers.firstDriver.internal = true;
        dbUsers.secondDriver.position = toDbPoint(deliveries[0].departure);
        dbUsers.secondDriver.available = true;
        dbUsers.secondDriver.internal = true;
        await Promise.all([
            dbUsers.firstDriver.save(),
            dbUsers.secondDriver.save()
        ]);
        response = await app.get("/user/drivers").send({
            from: deliveries[0].departure
        }).set("authorization", "Bearer " + token);
        assert.deepEqual(response.body.result?.length, 1);
    });

    describe("delivery state mutation tests", function () {
        let request;
        let driverToken;
        beforeEach(async function () {
            request = await requestDelivery({
                app,
                data: deliveries[0],
                phone: dbUsers.goodUser.phone
            });
            driverToken = await getToken(
                app,
                dbUsers.firstDriver.phone
            );
        });
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
            await Delivery.update(
                {status: deliveryStatuses.pendingReception},
                {where: {id: request.id}}
            );
            response = await app.post("/delivery/signal-reception").send({
                id: request.id
            }).set("authorization", "Bearer " + driverToken);
            assert.equal(response.status, 200);
            response = await Delivery.findOne({where: {id: request.id}});
            assert.equal(response.status, deliveryStatuses.toBeConfirmed);
        });

        it("should confirm package deposit", async function () {
            let response;
            await Delivery.update({
                driverId: dbUsers.firstDriver.id,
                status: deliveryStatuses.pendingReception
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
            assert.equal(response.status, deliveryStatuses.started);
            assert.isNotNull(response.begin);
        });
    });

});