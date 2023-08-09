/*jslint
node
*/
const {Server} = require("socket.io");
const {socketAuthenticator} = require("../utils/middlewares");
const {isValidLocation, sendCloudMessage} = require("../utils/helpers");
const {availableRoles, errors, eventMessages} = require("./config");


function getSocketManager({deliveryModel, httpServer, userModel}) {
    const io = new Server(httpServer);
    const deliveries = io.of("/delivery");
    const conflicts = io.of("/conflict");
    const connectedUsers = Object.create(null);

    function handleAssignment (data) {
        const eventName = "new-assignment";
        const {assignment, driverId} = data;
        if (connectedUsers[driverId] !== undefined) {
            connectedUsers[driverId].emit(eventName, assignment);
        }
    }
    async function handleEnding(data) {
        const {clientId, deliveryId} = data;
        const eventName = "delivery-end";
        let userInfos;
        let message;
        if (connectedUsers[clientId] !== undefined) {
            connectedUsers[clientId].emit(eventName, {deliveryId});
        } else {
            userInfos = await userModel?.findOne({where: {id: clientId}});
            message = eventMessages.deliveryEnd[userInfos?.lang ?? "en"];
            if (userInfos !== null && userInfos.deviceToken !== null) {
                await sendCloudMessage({
                    body: message.body,
                    meta: {deliveryId, eventName},
                    title: message.title,
                    to: userInfos.deviceToken
                });
            }
        }

    }

    function handleConnection(socket) {
        connectedUsers[socket.user.id] = socket;
        socket.on("disconnect", function () {
            delete connectedUsers[socket.user.id];
            socket.leave(socket.user.role);
        });
        socket.join(socket.user.role);
    }

    function handleUserConnection(socket) {
        handleConnection(socket);
        socket.on("new-position", async function (data) {
            await positionUpdateHandler(socket, data);
        });
    }

    function handleNewConflict(data) {
        const room = availableRoles.conflictManager;
        const {deliveryId, conflict, clientId} = data
        conflicts.in(room).emit("new-conflict", conflict);
        if (connectedUsers[clientId] !== undefined) {
            connectedUsers[clientId].emit("new-conflict", deliveryId);
        }
    }

    async function handleAcceptation(data) {
        const {clientId, deliveryId, driver} = data;
        const eventName = "delivery-accepted";
        let userInfos;
        let message;
        if (connectedUsers[clientId] !== undefined) {
            connectedUsers[clientId]?.emit(
                eventName,
                {deliveryId, driver}
            );
        } else {
            userInfos = await userModel?.findOne({where: {id: clientId}});
            message = eventMessages.deliveryAccepted[userInfos?.lang ?? "en"];
            if (userInfos !== null && userInfos.deviceToken !== null) {
                await sendCloudMessage({
                    body: message.body,
                    meta: {deliveryId, driver, eventName},
                    title: message.title,
                    to: userInfos.deviceToken
                });
            }
        }
    }
    
    function handleCancellation(data) {
        const {delivery, drivers} = data;
        const eventName = "delivery-cancelled";
        let message;
        drivers?.forEach(async function ({id, deviceToken, lang}) {
            if (connectedUsers[id] !== undefined) {
                connectedUsers[id].emit(eventName, delivery.id);
            } else if (deviceToken !== null) {
                message = eventMessages.deliveryCancelled[lang ?? "en"];
                await sendCloudMessage({
                    body: message.body,
                    meta: {deliveryId: delivery.id, eventName},
                    title: message.title,
                    to: deviceToken
                });
            }
        });
    }
    
    async function handleNewDelivery(data) {
        const {delivery, drivers} = data;
        const eventName = "new-delivery";
        let message;
        drivers?.forEach(async function ({id, deviceToken, lang}) {
            if (connectedUsers[id] !== undefined) {
                connectedUsers[id].emit(eventName, delivery);
            } else if (deviceToken !== null) {
                message = eventMessages.newDelivery[lang ?? "en"];
                await sendCloudMessage({
                    body: message.body,
                    meta: {delivery, eventName},
                    title: message.title,
                    to: deviceToken
                });
            }
        });
    }
    
    async function handleReception(data) {
        const {clientId, deliveryId} = data;
        const eventName = "delivery-recieved";
        if (connectedUsers[clientId] !== undefined) {
            connectedUsers[clientId]?.emit(eventName, deliveryId);
        } else {
            userInfos = await userModel?.findOne({where: {id: clientId}});
            message = eventMessages.newDelivery[userInfos?.lang ?? "en"];
            if (userInfos !== null && userInfos.deviceToken !== null) {
                await sendCloudMessage({
                    body: message.body,
                    meta: {deliveryId, eventName},
                    title: message.title,
                    to: userInfos.deviceToken
                });
            }
        }
    }
    function handleBegining(data) {
        const {deliveryId, participants} = data;
        const eventName = "delivery-started";
        
        participants?.forEach(async function (id) {
            let message;
            let userInfos
            if (connectedUsers[id] !== undefined) {
                connectedUsers[id].emit(
                    eventName,
                    deliveryId
                );
            } else {
                userInfos = userModel?.findOne({where: {id}});
                message = eventMessages.deliveryStarted[
                    userInfos?.lang ?? "en"
                ];
                if (userInfos !== null && userInfos.deviceToken !== null) {
                    await sendCloudMessage({
                        body: message.body,
                        meta: {deliveryId, eventName},
                        title: message.title,
                        to: userInfos.deviceToken
                    });
                }
            }
        });
    }


    async function positionUpdateHandler(socket, data) {
        let position;
        let interestedClients;
        const {id} = socket.user;
        if (isValidLocation(data)) {
            if (Array.isArray(data)) {
                position = data.at(-1);
            } else {
                position = data;
            }
            position = {
                coordinates: [position.latitude, position.longitude],
                type: "Point"
            };
            await userModel?.update({position}, {where: {id}});
            interestedClients = await deliveryModel?.findAll({where: {
                driverId: id,
                status: "started"
            }});
            interestedClients = interestedClients ?? [];
            interestedClients = interestedClients.map(
                (delivery) => delivery.clientId
            ).forEach(function (clientId) {
                connectedUsers[clientId]?.emit("new-position", data);
            });
            socket.emit("position-updated", position);
        } else {
            socket.emit("position-rejected", errors.invalidValues.message);
        }
    }

    deliveryModel?.addEventListener("delivery-end", handleEnding);
    deliveryModel?.addEventListener("delivery-accepted", handleAcceptation);
    deliveryModel?.addEventListener("delivery-cancelled", handleCancellation);
    deliveryModel?.addEventListener("delivery-recieved", handleReception);
    deliveryModel?.addEventListener("delivery-started", handleBegining);
    deliveryModel?.addEventListener("new-delivery", handleNewDelivery);
    deliveryModel?.addEventListener("new-assignment", handleAssignment);
    deliveryModel?.addEventListener("new-conflict", handleNewConflict);

    deliveries.use(socketAuthenticator());
    conflicts.use(socketAuthenticator([availableRoles.conflictManager]));
    io.use(socketAuthenticator([availableRoles.adminRole]));
    conflicts.on("connection", handleConnection);
    io.on("connection", handleConnection);
    deliveries.on("connection", handleUserConnection);


    return Object.freeze({
        forwardMessage(id, eventName, data) {
            connectedUsers[id]?.emit(eventName, data);
        },
        io
    });
}

module.exports = Object.freeze(getSocketManager);