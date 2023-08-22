
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
    generateToken,
    getToken,
    otpHandler,
    postData,
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
function updateItinerary({deliveryId, points, socket}) {
    return new Promise(function (res, rej) {
        socket.emit("itinerary-changed", {deliveryId, points});
        socket.on("itinerary-update-fulfilled", res);
        setTimeout(() => rej("Timeout Exceeded !!!"), 1500);
    });
}

describe("delivery side effects test", function () {
    let server;
    let app;
    let dbUsers;
    let socketServer;
    let setupDatas;

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

    after(function () {
        socketServer.close();
        server.close();
    });

    it("should reject if a user is not authenticated", async function () {
        try {
            await clientSocketCreator("delivery");
        } catch (error) {
            assert.deepEqual(error.data, errors.notAuthorized.message);
        }
    });

    it("should notify the client on delivery's ending", async function () {
        let data;
        const {driverToken, request} = setupDatas;
        const client = await clientSocketCreator("delivery", request.token);
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
                clientSocketCreator("delivery", request.token),
                clientSocketCreator("delivery", driverToken).then(function (driver) {
                    driver.emit("new-position", missoke);
                })
            ]);
            data = await listenEvent({
                name: "new-driver-position",
                socket: client
            });
            assert.deepEqual(data, {deliveryId: request.id, positions: missoke});
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
                clientSocketCreator("delivery", request.token),
                clientSocketCreator("delivery", driverToken)
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
            assert.isTrue(data.every((item) => item.value?.id !== undefined));
            assert.deepEqual(data[0].value, data[1].value);
            data = await Room.findOne({where: {id: data[0].value.id}});
            assert.isNotNull(data);
        });
    
        it("should notify a driver on client cancellation", async function () {
            let data;
            const {driverToken} = setupDatas;
            const driverSocket = await clientSocketCreator("delivery", driverToken);
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
            const client = await clientSocketCreator("delivery", request.token);
            await Delivery.update({
                status: deliveryStatuses.pendingReception,
                driverId: dbUsers.firstDriver.id
            }, {where: {id: request.id}});
            await app.post("/delivery/signal-on-site").send(request).set(
                "authorization", "Bearer " + driverToken
            );
            data = await listenEvent({
                name: "driver-on-site",
                socket: client
            });
            assert.equal(data, request.id);
        });
        it(
            "should notify delivery's begining on client confirmation",
            async function () {
                let data;
                const {driverToken} = setupDatas;
                const client = await clientSocketCreator(
                    "delivery",
                    request.token
                );
                const driverSocket =
                await clientSocketCreator(
                    "delivery",
                    driverToken
                );
                await Delivery.update({
                    driverId: dbUsers.firstDriver.id,
                    status: deliveryStatuses.toBeConfirmed
                }, {where: {id: request.id}});
                await app.post("/delivery/confirm-deposit").send(request).set(
                    "authorization", "Bearer " + request.token
                );
                data = await Promise.all([
                    listenEvent({
                        name: "delivery-started",
                        socket: client
                    }),
                    listenEvent({
                        name: "delivery-started",
                        socket: driverSocket
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
            clientSocketCreator("delivery", firstDriver),
            clientSocketCreator("delivery", secondDriver)
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
            assert.deepEqual(
                data.map((data) => data.value),
                [delivery.toResponse(), undefined]
            );
        });
    it("should enable a driver to update the itinerary", async function () {
        let data;
        const route = [
            {latitude: 4.045288, longitude: 9.713716},
            {latitude: 4.045502, longitude: 9.714724},
            {latitude: 4.046626, longitude: 9.716999}
        ];
        const {driverToken, request} = setupDatas;
        const [client, driver] = await Promise.all([
            clientSocketCreator("delivery", request.token),
            clientSocketCreator("delivery", driverToken)
        ]);
        await updateItinerary({
            deliveryId: request.id,
            points: route,
            socket: driver
        });
        data = await listenEvent({name: "itinerary-updated", socket: client});
        assert.deepEqual(data, {deliveryId: request.id, points: route});
    });
        
    it(
        "should notify the client on delivery closed",
        async function () {
            let data;
            const driverToken = await getToken(app, dbUsers.firstDriver.phone);
            const request = await requestDelivery({
                app,
                data: deliveries[0],
                phone: dbUsers.goodUser.phone
            });
            const [client, driver] = await Promise.all([
                clientSocketCreator("delivery", request.token),
                clientSocketCreator("delivery", driverToken)
            ]);
            const delivery = await Delivery.findOne({where: {id: request.id}});
            const room = await Room.create({name: "hello world"});
            await room.setUsers([
                dbUsers.firstDriver,
                dbUsers.goodUser
            ]);
            await room.setDelivery(delivery);
            delivery.status = deliveryStatuses.started;
            delivery.driverId = dbUsers.firstDriver.id;
            await delivery.save();
            data = await postData({
                app,
                data: {
                    code: request.code,
                    id: request.id
                },
                token: driverToken,
                url: "/delivery/verify-code"
            });
            data = await listenEvent({
                close: false,
                name: "delivery-end",
                socket: client
            });
            assert.equal(data, request.id)
            data = await Promise.allSettled([
                listenEvent({name: "room-deleted", socket: client}),
                listenEvent({name: "room-deleted", socket: driver})
            ]);
            assert.isTrue(data.every(
                (result) => result.value !== undefined
            ));
        }
    );
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
            let conflictManager = generateToken(
                dbUsers.conflictManager
            );
            const {
                request: delivery,
                driverToken
            } = setupDatas;
            await Delivery.update(
                {status: deliveryStatuses.started},
                {where: {id: delivery.id}}
            );
            [client, conflictManager] = await Promise.all([
                await clientSocketCreator("delivery", generateToken(dbUsers.goodUser)),
                await clientSocketCreator("conflict", conflictManager)

            ])
            await app.post("/delivery/conflict/report").send({
                conflictType: message.type,
                id: delivery.id,
                lastPosition: missoke
            }).set("authorization", "Bearer " + driverToken);
            data = await Promise.all([
                listenEvent({name: "new-conflict", socket: conflictManager}),
                listenEvent({name: "new-conflict", socket: client})
            ]);
            message.delivery = await Delivery.findOne(
                {where: {id: delivery.id}}
            );
            message.delivery = message.delivery.toResponse();
            message.reporter = dbUsers.firstDriver.toResponse();
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
            secondDriver = await clientSocketCreator("delivery", secondDriver);
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
                let manager = await clientSocketCreator("conflict", managerToken);
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
