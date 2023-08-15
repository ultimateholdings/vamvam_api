
const {
    after,
    afterEach,
    before,
    beforeEach,
    describe,
    it
} = require("mocha");
const {assert} = require("chai");
const {Delivery, DeliveryConflict, Room, User, connection} = require("../src/models");
const {
    clientSocketCreator,
    listenEvent,
    loginUser,
    getToken,
    otpHandler,
    syncUsers,
    users
} = require("./fixtures/helper");
const {
    deliveries,
    deliveryResquestor,
    missoke,
    setupDeliveryServer
} = require("./fixtures/deliveries.data");
const getSocketManager = require("../src/utils/socket-manager");
const getDeliveryHandler = require("../src/modules/delivery.socket-handler");
const getConflictHandler = require("../src/modules/conflict.socket-handler");
const {deliveryStatuses, errors} = require("../src/utils/config");
const {toDbPoint} = require("../src/utils/helpers");

const {
    setupDelivery,
    requestDelivery
} = deliveryResquestor(getToken, Delivery);

function updatePosition(socket, position) {
    return new Promise(function (res) {
        socket.emit("new-position", position);
        socket.on("position-updated", res);
    });
}

describe("delivery side effects test", function () {
    let server;
    let app;
    let dbUsers;
    let socketServer;
    let setupDatas;
    const connectUser = clientSocketCreator("delivery");
    const connectConflictManager = clientSocketCreator("conflict");

    before(function () {
        const tmp = setupDeliveryServer(otpHandler);
        server = tmp.server;
        app = tmp.app;
        socketServer = getSocketManager({
            conflictHandler: getConflictHandler(Delivery),
            deliveryHandler: getDeliveryHandler(Delivery),
            httpServer: server
        });
    });

    beforeEach(async function () {
        await connection.sync({force: true});
        dbUsers = await syncUsers(users, User);
        setupDatas = await setupDelivery({
            app,
            clientPhone: dbUsers.goodUser.phone,
            delivery: deliveries[0],
            driverData: dbUsers.firstDriver,
            initialState: deliveryStatuses.started
        });
    });

    afterEach(async function () {
        await connection.drop();
    });

    after(async function () {
        socketServer.close();
        await server.close();
    });

    it("should reject if a user is not authenticated", async function () {
        try {
            await connectUser();
        } catch (error) {
            assert.deepEqual(error.data, errors.notAuthorized.message);
        }
    });

    it("should notify the client on delivery's ending", async function () {
        let data;
        const {driverToken, request} = setupDatas;
        const client = await connectUser(request.token);
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
                connectUser(request.token),
                connectUser(driverToken).then(function (driver) {
                    driver.emit("new-position", missoke);
                })
            ]);
            data = await listenEvent({
                name: "new-driver-position",
                socket: client
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
        const nearByPoint = {
            latitude: 4.0470347,
            longitude: 9.6971706
        };
        const farPoint = {
            latitude: 3.989972,
            longitude: 9.799537
        };
        beforeEach(async function () {
            request = await requestDelivery({
                app,
                data: deliveries[1],
                phone: dbUsers.goodUser.phone
            });
        });
            
        it("should notify a client on driver approval", async function () {
            let data;
            const {driverToken} = setupDatas;
            const [client, driver] = await Promise.all([
                connectUser(request.token),
                connectUser(driverToken)
            ]);
            await app.post("/delivery/accept").send(request).set(
                "authorization", "Bearer " + driverToken
            );
            data = await new Promise(function (res) {
                client.on("delivery-accepted", function (data) {
                    res(data);
                });
            });
            assert.deepEqual(data, {
                deliveryId: request.id,
                driver: dbUsers.firstDriver.toResponse()
            });
            data = await Promise.allSettled([
                listenEvent({
                    name: "room-created",
                    socket: client,
                }),
                listenEvent({
                    name: "room-created",
                    socket: driver
                })
            ]);
            assert.isTrue(data.every((item) => item.value?.roomId !== undefined));
            assert.equal(data[0].value.roomId, data[1].value.roomId);
            data = await Room.findOne({where: {id: data[0].value.roomId}});
            assert.isNotNull(data);
        });
    
        it("should notify a driver on client cancellation", async function () {
            let data;
            const {driverToken} = setupDatas;
            const driverSocket = await connectUser(driverToken);
            dbUsers.firstDriver.position = toDbPoint(nearByPoint);
            await dbUsers.firstDriver.save();
            await app.post("/delivery/cancel").send(request).set(
                "authorization", "Bearer " + request.token
            );
            data = await listenEvent({
                name: "delivery-cancelled",
                socket: driverSocket
            });
            assert.equal(data, request.id);
        });
        it("should notify the client on driver reception", async function () {
            let data;
            const {driverToken} = setupDatas;
            const client = await connectUser(request.token);
            await Delivery.update({
                status: deliveryStatuses.pendingReception,
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
        });
        it(
            "should notify delivery's begining on client confirmation",
            async function () {
                let data;
                const {driverToken} = setupDatas;
                const client = await connectUser(request.token);
                const driverSocket = await connectUser(driverToken);
                await Delivery.update({
                    driverId: dbUsers.firstDriver.id,
                    status: deliveryStatuses.toBeConfirmed
                }, {where: {id: request.id}});
                await app.post("/delivery/confirm-deposit").send(request).set(
                    "authorization", "Bearer " + request.token
                );
                data = await Promise.all([
                    new Promise(function(res) {
                        client.on("delivery-started", function (data) {
                            client.close();
                            res(data);
                        });
                    }),
                    new Promise(function (res) {
                        driverSocket.on("delivery-started", function (data) {
                            driverSocket.close();
                            res(data);
                        });
                    })
                ]);
                assert.deepEqual(data, new Array(2).fill(request.id));
            }
        );
        it("should notify the nearBy drivers on new delivery", async function () {
           let data;
           let request;
           let delivery;
           let [client, firstDriver, secondDriver] = await Promise.all([
               getToken(app, dbUsers.goodUser.phone),
               getToken(app, dbUsers.firstDriver.phone),
               getToken(app, dbUsers.secondDriver.phone)
            ]);
           [firstDriver, secondDriver] = await Promise.all([
            connectUser(firstDriver),
            connectUser(secondDriver)
           ]);
           await Promise.all([
               updatePosition(firstDriver, nearByPoint),
               updatePosition(secondDriver, farPoint)
            ]);
            request = await app.post("/delivery/request").send(
                deliveries[1]
            ).set("authorization", "Bearer " + client);
            data = await Promise.allSettled([
                listenEvent({
                    name: "new-delivery",
                    socket: firstDriver,
                    timeout: 1500
                }),
                listenEvent({
                    name: "new-delivery",
                    socket: secondDriver,
                    timeout: 1500
                })
            ]);
            delivery = await Delivery.findOne({where: {id: request.body.id}});
            assert.deepEqual(data.map((data) => data.value), [delivery.toResponse(), undefined]);
        });
    });
    describe("conflict tests", function () {
        let message;
        let request;
        let driverToken;
        let managerToken;
        let conflict;
        beforeEach(async function () {
            const setupDatas = await setupDelivery({
                app,
                clientPhone: dbUsers.goodUser.phone,
                delivery: deliveries[0],
                driverData: dbUsers.firstDriver,
                initialState: deliveryStatuses.pendingReception
            });
            managerToken = await loginUser(
                app,
                dbUsers.conflictManager.phone,
                "aSimplePass"
            );
            message = {
                lastPosition: missoke,
                reporter: dbUsers.firstDriver.toResponse(),
                type: "Package damaged"
            };
            request = setupDatas.request;
            driverToken = setupDatas.driverToken;
            conflict = await DeliveryConflict.create({
                deliveryId: request.id,
                type: "Package damaged",
                lastLocation: toDbPoint(missoke),
            });
            request.delivery = await Delivery.findOne({where: {id: request.id}});
        });
        it("should notify the manager and client on conflict", async function () {
            let data;
            let client;
            let conflictManager = await connectConflictManager(managerToken);
            const {
                request: delivery,
                driverToken: secondDriverToken,
            } = await setupDelivery({
                app,
                clientPhone: dbUsers.goodUser.phone,
                delivery: deliveries[0],
                driverData: dbUsers.secondDriver,
                initialState: deliveryStatuses.started
            });
            client = await connectUser(delivery.token);
            await app.post("/delivery/conflict/report").send({
                conflictType: message.type,
                id: delivery.id,
                lastPosition: missoke
            }).set("authorization", "Bearer " + secondDriverToken);
            data = await Promise.all([
                listenEvent({name: "new-conflict", socket: conflictManager}),
                listenEvent({name: "new-conflict", socket: client})
            ]);
            message.delivery = await Delivery.findOne(
                {where: {id: delivery.id}}
            );
            message.delivery = message.delivery.toResponse();
            message.reporter = dbUsers.secondDriver.toResponse();
            assert.deepEqual(data, [message, delivery.id]);
        });
        
        it("should notify a driver on new assignment", async function () {
            let response;
            const endPoint = "/delivery/conflict/assign-driver";
            let secondDriver = await getToken(app, dbUsers.secondDriver.phone);
            let payload = {
                id: conflict.id,
                driverId: dbUsers.secondDriver.id
            };
            secondDriver = await connectUser(secondDriver);
            response = await app.post(endPoint).send(payload).set(
                "authorization", "Bearer " + driverToken
            );
            assert.equal(response.status, errors.notAuthorized.status);
            response = await app.post(endPoint).send(payload).set(
                "authorization", "Bearer " + managerToken
            );
            assert.equal(response.status, 200);
            response = await listenEvent({
                name: "new-assignment",
                socket: secondDriver
            });
            payload = await conflict.getDeliveryDetails();
            assert.deepEqual(response, payload);
        });

        it(
            "should notify the manager when a backup finish a delivery",
            async function () {
                let response;
                let manager = await connectConflictManager(managerToken);
                let secondDriver = await getToken(
                    app,
                    dbUsers.secondDriver.phone
                );
                conflict.assigneeId = dbUsers.secondDriver.id;
                conflict.assignerId = dbUsers.conflictManager.id;
                await conflict.save();
                response = await app.post("/delivery/conflict/verify-code").send({
                    code: request.delivery.code,
                    deliveryId: request.id,
                }).set("authorization", "Bearer " + secondDriver);
                assert.equal(response.status, 200);
                response = await listenEvent({
                    name: "conflict-solved",
                    socket: manager
                });
                assert.equal(response, conflict.id);
            }
        );

    })
});
