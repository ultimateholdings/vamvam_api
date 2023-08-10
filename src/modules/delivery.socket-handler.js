/*jslint
node
*/
const {eventMessages} = require("../utils/config");
const {socketAuthenticator} = require("../utils/middlewares");

function deliveryMessageHandler(emitter) {
    const connectedUsers = Object.create(null);
    return function deliverySocketHandler(socketServer) {
        const nameSpace = socketServer.of("/delivery");

        function handleConnection(socket) {
            connectedUsers[socket.user.id] = socket;
            socket.on("disconnect", function () {
                delete connectedUsers[socket.user.id];
                socket.leave(socket.user.role);
            });
            socket.join(socket.user.role);
            socket.on("new-position", function (data) {
                positionUpdateHandler(socket, data);
            });
        }

        function positionUpdateHandler(socket, data) {
            const {id} = socket.user;
            emitter.emitEvent(
                "driver-position-update-requested",
                {data, driverId: id}
            );
        }

        function onPositionUpdateCompleted({clients, data, driverId}) {
            connectedUsers[driverId]?.emit("position-updated", true);
            clients.forEach(function (clientId) {
                connectedUsers[clientId]?.emit("new-driver-position", data);
            });
        }

        function handleAcceptation(data) {
            const {clientId, deliveryId, driver} = data;
            const eventName = "delivery-accepted";
            if (connectedUsers[clientId] !== undefined) {
                connectedUsers[clientId].emit(
                    eventName,
                    {deliveryId, driver}
                );
            } else {
                emitter.emitEvent(
                    "cloud-message-fallback-requested",
                    {
                        message: eventMessages.deliveryEnd,
                        meta: {deliveryId, driver, eventName},
                        recieverId: clientId
                    }
                );
            }
        }

        function handleAssignment(data) {
            const eventName = "new-assignment";
            const {assignment, driverId} = data;
            if (connectedUsers[driverId] !== undefined) {
                connectedUsers[driverId].emit(eventName, assignment);
            } else {
                emitter.emitEvent(
                    "cloud-message-fallback-requested",
                    {
                        message: eventMessages.newAssignment,
                        meta: {assignment, eventName},
                        recieverId: driverId
                    }
                );
            }
        }

        function handleEnding(data) {
            const {clientId, deliveryId} = data;
            const eventName = "delivery-end";
            if (connectedUsers[clientId] !== undefined) {
                connectedUsers[clientId].emit(eventName, {deliveryId});
            } else {
                emitter.emitEvent(
                    "cloud-message-fallback-requested",
                    {
                        message: eventMessages.deliveryEnd,
                        meta: {deliveryId, eventName},
                        recieverId: clientId
                    }
                );
            }
        }

        function handleCancellation(data) {
            const {delivery, drivers} = data;
            const eventName = "delivery-cancelled";
            let message;
            drivers?.forEach(function ({deviceToken, id, lang}) {
                if (connectedUsers[id] !== undefined) {
                    connectedUsers[id].emit(eventName, delivery.id);
                } else if (deviceToken !== null) {
                    message = eventMessages.deliveryCancelled[lang ?? "en"];
                    message.meta = {deliveryId: delivery.id, eventName};
                    message.to = deviceToken;
                    emitter.emitEvent(
                        "cloud-message-sending-requested",
                        message
                    );
                }
            });
        }

        function handleReception(data) {
            const {clientId, deliveryId} = data;
            const eventName = "delivery-recieved";
            if (connectedUsers[clientId] !== undefined) {
                connectedUsers[clientId]?.emit(eventName, deliveryId);
            } else {
                emitter.emitEvent(
                    "cloud-message-fallback-requested",
                    {
                        message: eventMessages.newDelivery,
                        meta: {deliveryId, eventName},
                        recieverId: clientId
                    }
                );
            }
        }

        function handleBegining(data) {
            const {deliveryId, participants} = data;
            const eventName = "delivery-started";
            participants?.forEach(function (id) {
                if (connectedUsers[id] !== undefined) {
                    connectedUsers[id].emit(
                        eventName,
                        deliveryId
                    );
                } else {
                    emitter.emitEvent(
                        "cloud-message-fallback-requested",
                        {
                            message: eventMessages.deliveryStarted,
                            meta: {deliveryId, eventName},
                            recieverId: id
                        }
                    );
                }
            });
        }

        function handleNewDelivery(data) {
            const {delivery, drivers} = data;
            const eventName = "new-delivery";
            let message;
            drivers?.forEach(function ({deviceToken, id, lang}) {
                if (connectedUsers[id] !== undefined) {
                    connectedUsers[id].emit(eventName, delivery);
                } else if (deviceToken !== null) {
                    message = eventMessages.newDelivery[lang ?? "en"];
                    message.meta = {delivery, eventName};
                    message.to = deviceToken;
                    emitter.emitEvent(
                        "cloud-message-sending-requested",
                        message
                    );
                }
            });
        }

        function handleNewConflict(data) {
            const eventName = "new-conflict";
            const {clientId, deliveryId} = data;
            if (connectedUsers[clientId] !== undefined) {
                connectedUsers[clientId].emit(eventName, deliveryId);
            } else {
                emitter.emitEvent(
                    "cloud-message-fallback-requested",
                    {
                        message: eventMessages.newConflict,
                        meta: {deliveryId, eventName},
                        recieverId: clientId
                    }
                );
            }
        }

        emitter?.addEventListener(
            "driver-position-update-completed",
            onPositionUpdateCompleted
        );

        emitter?.addEventListener("delivery-end", handleEnding);
        emitter?.addEventListener("delivery-accepted", handleAcceptation);
        emitter?.addEventListener("delivery-cancelled", handleCancellation);
        emitter?.addEventListener("delivery-recieved", handleReception);
        emitter?.addEventListener("delivery-started", handleBegining);
        emitter?.addEventListener("new-delivery", handleNewDelivery);
        emitter?.addEventListener("new-assignment", handleAssignment);
        emitter?.addEventListener("new-conflict", handleNewConflict);
        nameSpace.use(socketAuthenticator());
        nameSpace.on("connection", handleConnection);
    };
}

module.exports = Object.freeze(deliveryMessageHandler);