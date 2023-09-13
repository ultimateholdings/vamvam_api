/*jslint
node
*/
const {eventMessages, errors} = require("../utils/config");
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
            socket.on("messages-read", function (data) {
                let messagesId = null;
                try {
                    messagesId = JSON.parse(data.toString());
                } catch (ignore) {
                    messagesId = data;
                }
                if (
                    Array.isArray(messagesId) &&
                    messagesId.every((id) => typeof id === "string")
                ) {
                    emitter.emitEvent(
                        "messages-read-request",
                        {messagesId, userId: socket.user.id}
                    );
                } else {
                    socket.emit(
                        "messages-read-fail",
                        errors.invalidValues.message
                    );
                }
            });
            socket.on("itinerary-changed", function (data) {
                itineraryUpdateHandler(socket, data);
            });
            emitter.emitEvent(
                "missed-messages-requested",
                {userId: socket.user.id}
            );
        }

        function positionUpdateHandler(socket, data) {
            const {id} = socket.user;
            emitter.emitEvent(
                "driver-position-update-requested",
                {data, driverId: id}
            );
        }

        function itineraryUpdateHandler(socket, data) {
            const {id} = socket.user;
            let message;
            try {
                message = JSON.parse(data.toString());
            } catch (ignore) {
                message = data
            }
            message.driverId = id;
            emitter.emitEvent(
                "delivery-itinerary-update-requested",
                message
            );
        }

        function handlePositionUpdateFailure(data) {
            const {driverId, ...rest} = data;
            connectedUsers[driverId]?.emit("position-update-failed", rest);
        }

        function handleRejectedItinerary({driverId, error, points, id}) {
            if (connectedUsers[driverId] !== undefined) {
                connectedUsers[driverId].emit(
                    "itinerary-update-failed",
                    {error, id, points}
                );
            }
        }

        function handleNotification({data, eventName, fallbackMessage}) {
            const {userId, payload} = data;
            debugger;
            if (connectedUsers[userId] !== undefined) {
                connectedUsers[userId].emit(
                    eventName,
                    payload
                );
            } else {
                if (fallbackMessage !== undefined && fallbackMessage !== null) {
                    emitter.emitEvent(
                        "cloud-message-fallback-requested",
                        {
                            message: fallbackMessage,
                            meta: {eventName, payload},
                            receiverId: userId
                        }
                    );
                }
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
                        meta: {eventName, payload: assignment},
                        receiverId: driverId
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
                    message.meta = {eventName, payload: delivery.id};
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
            const eventName = "driver-on-site";
            if (connectedUsers[clientId] !== undefined) {
                connectedUsers[clientId]?.emit(eventName, deliveryId);
            } else {
                emitter.emitEvent(
                    "cloud-message-fallback-requested",
                    {
                        message: eventMessages.newDelivery,
                        meta: {eventName, payload: deliveryId},
                        receiverId: clientId
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
                            meta: {eventName, payload: deliveryId},
                            receiverId: id
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
                    message.meta = {eventName, payload: delivery};
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
                        meta: {eventName, payload: deliveryId},
                        receiverId: clientId
                    }
                    );
                }
        }

        function handleMissedMessages(data) {
            const {roomId, userId} = data;
            if (connectedUsers[userId] !== undefined) {
                connectedUsers[userId].join(roomId);
                delete data.userId;
                connectedUsers[userId].emit("new-missed-messages", data);
            }
        }

        function handleReadMessages({updated, userId}) {
            if (connectedUsers[userId]) {
                connectedUsers[userId].emit(
                    "messages-marked-as-read",
                    {updated: updated > 0}
                );
            }
        }

        function handleNewMessage({message, userId}) {
            const eventName = "new-message";
            if (connectedUsers[userId] !== undefined) {
                connectedUsers[userId].emit(eventName, message);
                connectedUsers[userId].join(message.room.id);
            } else {
                emitter.emitEvent(
                    "cloud-message-fallback-requested",
                    {
                        message: eventMessages.withSameContent(
                            message.room.name,
                            message.sender.firstName + ": " + message.content
                        ),
                        meta: {eventName, payload: message},
                        receiverId: userId
                    }
                );
            }
        }

        function handleRoomDeleted({payload, userId}) {
            const eventName = "room-deleted";
            debugger;
            if (connectedUsers[userId] !== undefined) {
                connectedUsers[userId].emit(eventName, payload);
                connectedUsers[userId].leave(payload.id);
            } else {
                emitter.emitEvent(
                    "cloud-message-fallback-requested",
                    {
                        message: eventMessages.withSameTitle(
                            payload.name,
                            eventMessages.roomDeletedBody
                        ),
                        meta: {eventName, payload},
                        receiverId: userId
                    }
                );
            }
        }
        
        function handleRoomJoin(data) {
            const {room, users} = data;
            const eventName = "room-created";
            users.forEach(function (id) {
                if (connectedUsers[id] !== undefined) {
                    connectedUsers[id].join(room.id);
                    connectedUsers[id].emit(eventName, room);
                } else {
                    emitter.emitEvent(
                        "cloud-message-fallback-requested",
                        {
                            message: eventMessages.newRoom,
                            meta: {eventName, payload: room},
                            receiverId: id
                        }
                    );
                }
            });
        }


        function handleInitPayment({driverId}) {
            const eventName = "payment-initiated";
            if (connectedUsers[driverId] !== undefined) {
                connectedUsers[driverId].emit(eventName);
            } else {
                emitter.emitEvent(
                    "cloud-message-fallback-requested",
                    {
                        message: eventMessages.initPayment,
                        meta: {eventName},
                        receiverId: driverId
                    }
                    );
                }
        }
        function handleFailurePayment({driverId}) {
            const eventName = "failure-payment";
            if (connectedUsers[driverId] !== undefined) {
                connectedUsers[driverId].emit(eventName);
            } else {
                emitter.emitEvent(
                    "cloud-message-fallback-requested",
                    {
                        message: eventMessages.failurePayment,
                        meta: {eventName},
                        receiverId: driverId
                    }
                    );
                }
        }
        function handleSuccessPayment({data}) {
            const eventName = "successful-payment";
            const {driverId} = data;
            if (connectedUsers[driverId] !== undefined) {
                connectedUsers[driverId].emit(eventName, {data});
            } else {
                emitter.emitEvent(
                    "cloud-message-fallback-requested",
                    {
                        message: eventMessages.successPayment,
                        meta: {eventName},
                        receiverId: driverId
                    }
                    );
                }
        }
        function handlePointWithdrawal(data) {
            const eventName = "point-widthdrawn";
            const {driverId, payload} = data;
            if (connectedUsers[driverId] !== undefined) {
                connectedUsers[driverId].emit(eventName, payload);
            }
        }
        emitter.addEventListener(
            "delivery-accepted",
            (data) => handleNotification({
                data,
                eventName: "delivery-accepted",
                fallbackMessage: eventMessages.deliveryAccepted
            })
        );
        emitter.addEventListener(
            "new-invitation",
            (data) => handleNotification({
                data,
                eventName: "new-invitation",
                fallbackMessage: eventMessages.newInvitation
            })
        );

        emitter?.addEventListener(
            "driver-position-update-completed",
            (data) => handleNotification({
                data,
                eventName: "position-updated"
            })
        );
        emitter.addEventListener(
            "driver-position-updated",
            (data) => handleNotification({
                data,
                eventName: "new-driver-position"
            })
        );
        emitter.addEventListener(
            "itinerary-updated",
            (data) => handleNotification({
                data,
                eventName: "itinerary-updated"
            })
        );
        emitter.addEventListener(
            "itinerary-update-fulfilled",
            (data) => handleNotification({
                data,
                eventName: "itinerary-update-fulfilled"
            })
        );
        emitter.addEventListener(
            "delivery-end",
            (data) => handleNotification({
                data,
                eventName: "delivery-end"
            })
        );
        emitter.addEventListener("delivery-cancelled", handleCancellation);
        emitter.addEventListener("delivery-recieved", handleReception);
        emitter.addEventListener("delivery-started", handleBegining);
        emitter.addEventListener("new-delivery", handleNewDelivery);
        emitter.addEventListener("new-assignment", handleAssignment);
        emitter.addEventListener("new-conflict", handleNewConflict);
        emitter.addEventListener("room-created", handleRoomJoin);
        emitter.addEventListener("missed-messages-from-room", handleMissedMessages);
        emitter.addEventListener("messages-read-fulfill", handleReadMessages);
        emitter.addEventListener("new-message-sent", handleNewMessage);
        emitter.addEventListener("room-deleted", handleRoomDeleted);
        emitter.addEventListener(
            "itinerary-update-rejected",
            handleRejectedItinerary
        );
        emitter.addEventListener("payment-initiated", handleInitPayment);
        emitter.addEventListener("failure-payment", handleFailurePayment);
        emitter.addEventListener("successful-payment", handleSuccessPayment);
        emitter.addEventListener("point-withdrawal-fulfill", handlePointWithdrawal);
        emitter.addEventListener(
            "driver-position-update-failed",
            handlePositionUpdateFailure
        );
        nameSpace.use(socketAuthenticator());
        nameSpace.on("connection", handleConnection);
    };
}

module.exports = Object.freeze(deliveryMessageHandler);