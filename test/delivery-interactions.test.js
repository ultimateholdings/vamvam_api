
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
    deliveries,
    deliveryResquestor,
    missoke,
    positions,
    setupDeliveryServer
} = require("./fixtures/deliveries.data");
const getSocketManager = require("../src/utils/socket-manager");

const {
    setupDeliveryClosing
} = deliveryResquestor(getToken, Delivery);

describe("delivery side effects test", function () {
    let server;
    let app;
    let dbUsers;
    let socketServer;
    let socketGenerator = clientSocketCreator("delivery");

    before(function () {
        const tmp = setupDeliveryServer(otpHandler);
        server = tmp.server;
        app = tmp.app;
        socketServer = getSocketManager({
            deliveryModel: Delivery,
            httpServer: server,
        });
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
        socketServer.io.close();
    });
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

    it(
        "should notify a client when a driver update his position",
        function (done) {
            setupDeliveryClosing({
                app,
                clientPhone: dbUsers.goodUser.phone,
                delivery: deliveries[0],
                driverData: dbUsers.firstDriver
            }).then(function ({driverToken, request}) {
                return Promise.allSettled([
                    socketGenerator(request.token),
                    socketGenerator(driverToken).then(function (driver) {
                        driver.emit("new-position", missoke);
                    })
                ]);
            }).then(function ([{value: clientSocket}]) {
                clientSocket.on("new-position", function (data) {
                    assert.deepEqual(data, missoke);
                    done();
                });
            });
        }
    );

});