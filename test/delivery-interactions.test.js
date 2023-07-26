
const {
    after,
    afterEach,
    before,
    beforeEach,
    describe,
    it
} = require("mocha");
const {assert, should} = require("chai");
const {Delivery, User, connection} = require("../src/models");
const {
    clientSocketCreator,
    getToken,
    otpHandler,
    syncUsers,
    users
} = require("./fixtures/users.data");
const {
    deliveries,
    deliveryResquestor,
    missoke,
    setupDeliveryServer
} = require("./fixtures/deliveries.data");
const getSocketManager = require("../src/utils/socket-manager");

const {
    setupDelivery,
    requestDelivery
} = deliveryResquestor(getToken, Delivery);

describe("delivery side effects test", function () {
    let server;
    let app;
    let dbUsers;
    let socketServer;
    let setupDatas;
    let socketGenerator = clientSocketCreator("delivery");

    before(function () {
        const tmp = setupDeliveryServer(otpHandler);
        server = tmp.server;
        app = tmp.app;
        socketServer = getSocketManager({
            deliveryModel: Delivery,
            httpServer: server,
            userModel: User
        });
    });

    beforeEach(async function () {
        await connection.sync({force: true});
        dbUsers = await syncUsers(users, User);
        setupDatas = await setupDelivery({
            app,
            clientPhone: dbUsers.goodUser.phone,
            delivery: deliveries[0],
            driverData: dbUsers.firstDriver
        });
    });

    afterEach(async function () {
        await connection.drop();
    });

    after(function () {
        server.close();
        socketServer.io.close();
    });
    it("should notify the client on delivery's ending", async function () {
        let data;
        const {driverToken, request} = setupDatas;
        const client = await socketGenerator(request.token);
        await app.post("/delivery/verify-code").send(request).set(
            "authorization", "Bearer " + driverToken
            );
            data = await new Promise(function (res) {
            client.on("delivery-end", function (data) {
                client.close();
                res(data)
            });
        });
        assert.equal(data.deliveryId, request.id);
    });
    
    it(
        "should notify a client when a driver update his position",
        async function () {
            let data;
            const {driverToken, request} = setupDatas;
            const [{value: client}] = await Promise.allSettled([
                socketGenerator(request.token),
                socketGenerator(driverToken).then(function (driver) {
                    driver.emit("new-position", missoke);
                })
            ]);
            data = await new Promise(function (res) {
                client.on("new-position", function (data) {
                    client.close();
                    res(data);
                });
            });
            assert.deepEqual(data, missoke);
            data = await User.findOne({where: {id: dbUsers.firstDriver.id}});
            assert.deepEqual(data.position, {
                type: "Point",
                coordinates: [missoke.latitude, missoke.longitude]
            });
        }
    );
    describe("delivery initialization interactions", function () {
        let request;
        beforeEach(async function () {
            request = await requestDelivery({
                app,
                data: deliveries[1],
                phone: dbUsers.goodUser.phone
            });
            await Delivery.update({status: Delivery.statuses.initial}, {
                where: {id: request.id}
            });
        });
            
        it("should notify a client on driver approval", async function () {
            let data;
            const {driverToken} = setupDatas;
            const client = await socketGenerator(request.token);
            await app.post("/delivery/accept").send(request).set(
                "authorization", "Bearer " + driverToken
            );
            data = await new Promise(function (res) {
                client.on("delivery-accepted", function (data) {
                    client.close();
                    res(data);
                });
            });
            assert.deepEqual(data, dbUsers.firstDriver.toResponse());
        });
    
        it("should notify a driver on client cancellation", async function () {
            let data;
            const {driverToken} = setupDatas;
            const driverSocket = await socketGenerator(driverToken);
            await new Promise(function (res) {
                driverSocket.emit("new-position", {
                    latitude: 4.072985,
                    longitude: 9.716445
                });
                driverSocket.on("position-updated", function () {
                    res();
                });
            });
            await app.post("/delivery/cancel").send(request).set(
                "authorization", "Bearer " + request.token
            );
            data = await new Promise(function (res) {
                driverSocket.on("delivery-cancelled", function (data) {
                    driverSocket.close();
                    res(data);
                });
            });
            assert.equal(data, request.id);
        });
        it("should notify the client on driver reception", async function () {
            let data;
            const {driverToken} = setupDatas;
            const client = await socketGenerator(request.token);
            await Delivery.update({
                status: Delivery.statuses.pendingReception,
                driverId: dbUsers.firstDriver.id
            }, {where: {id: request.id}});
            await app.post("/delivery/signal-reception").send(request).set(
                "authorization", "Bearer " + driverToken
            );
            data = await new Promise(function (res) {
                client.on("delivery-recieved", function (data) {
                    client.close();
                    res(data);
                });
            });
            assert.equal(data, request.id);
        })
    })
});
