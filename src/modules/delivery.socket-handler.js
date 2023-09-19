/*jslint
node
*/
const {errors, eventMessages} = require("../utils/config");
const {socketAuthenticator} = require("../utils/middlewares");

function deliveryMessageHandler(emitter) {
    const connectedUsers = Object.create(null);
    return function deliverySocketHandler(socketServer) {
        const nameSpace = socketServer.of("/delivery");

        function tryParse(data) {
            let result;
            try {
                result = JSON.parse(data.toString());
            } catch (ignore) {
                result = data;
            }
            return result;
        }
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
                let messagesId = tryParse(data);
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
            let message = tryParse(data);
            emitter.emitEvent(
                "delivery-itinerary-update-requested",
                {payload: message, userId: id}
            );
        }

        function handleNotificationWithUserData({
            data,
            eventName,
            fallbackMessage
        }) {
            const {payload, user} = data;
            let message;
            if (connectedUsers[user.id] !== undefined) {
                connectedUsers[user.id].emit(eventName, payload);
            } else if (
                user.deviceToken !== null &&
                fallbackMessage !== null &&
                fallbackMessage !== undefined
            ) {
                message = fallbackMessage[user.lang ?? "en"];
                message.meta = {eventName, payload};
                message.to = user.deviceToken;
                emitter.emitEvent(
                    "cloud-message-sending-requested",
                    message
                );
            }
        }

        function handleNotification({data, eventName, fallbackMessage}) {
            const {payload, userId} = data;
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
        emitter.addEventListener(
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
                eventName: "delivery-end",
                fallbackMessage: eventMessages.deliveryEnd
            })
        );
        emitter.addEventListener(
            "delivery-cancelled",
            (data) => handleNotificationWithUserData({
                data,
                eventName: "delivery-cancelled",
                fallbackMessage: eventMessages.deliveryCancelled
            })
        );
        emitter.addEventListener(
            "new-delivery",
            (data) => handleNotificationWithUserData({
                data,
                eventName: "new-delivery",
                fallbackMessage: eventMessages.newDelivery
            })
        );
        emitter.addEventListener(
            "room-created",
            function (data) {
                if (connectedUsers[data.userId]) {
                    connectedUsers[data.userId].join(data.payload.id);
                }
                handleNotification({
                    data,
                    eventName: "room-created",
                    fallbackMessage: eventMessages.newRoom
                });
            }
        );
        emitter.addEventListener(
            "delivery-received",
            (data) => handleNotification({
                data,
                eventName: "driver-on-site",
                fallbackMessage: eventMessages.driverArrived
            })
        );
        emitter.addEventListener(
            "delivery-started",
            (data) => handleNotification({
                data,
                eventName: "delivery-started",
                fallbackMessage: eventMessages.deliveryStarted
            })
        );
        emitter.addEventListener(
            "delivery/new-conflict",
            (data) => handleNotification({
                data,
                eventName: "new-conflict",
                fallbackMessage: eventMessages.newConflict
            })
        );
        emitter.addEventListener(
            "new-assignment",
            (data) => handleNotification({
                data,
                eventName: "new-assignment",
                fallbackMessage: eventMessages.newAssignment
            })
        );
        emitter.addEventListener(
            "missed-messages-from-room",
            function (data) {
                if (connectedUsers[data.userId] !== undefined) {
                    connectedUsers[data.userId].join(data.payload.roomId);
                }
                handleNotification({data, eventName: "new-missed-messages"});
            }
        );
        emitter.addEventListener(
            "messages-read-fulfill",
            (data) => handleNotification({
                data,
                eventName: "messages-marked-as-read"
            })
        );
        emitter.addEventListener(
            "new-message-sent",
            (data) => handleNotification({
                data,
                eventName: "new-message",
                fallbackMessage: eventMessages.withSameContent(
                    data.payload.room.name,
                    data.payload.sender.firstName + ": " + data.payload.content
                )
            })
        );
        emitter.addEventListener(
            "room-deleted",
            function (data) {
                if (connectedUsers[data.userId] !== undefined) {
                    connectedUsers[data.userId].leave(data.payload.id);
                }
                handleNotification({
                    data,
                    eventName: "room-deleted",
                    fallbackMessage: eventMessages.withSameTitle(
                        data.payload.name,
                        eventMessages.roomDeletedBody
                    )
                });
            }
        );
        emitter.addEventListener(
            "itinerary-update-rejected",
            (data) => handleNotification({
                data,
                event: "itinerary-update-failed"
            })
        );
        emitter.addEventListener(
            "point-withdrawal-fulfill",
            (data) => handleNotification({
                data,
                eventName: "point-widthdrawn"
            })
        );
        emitter.addEventListener(
            "failure-payment",
            (data) => handleNotification({
                data,
                eventName: "failure-payment",
                fallbackMessage: eventMessages.failurePayment
            })
        );
        emitter.addEventListener(
            "successful-payment",
            function(data){
                eventMessages.successPayment.en.body = eventMessages.successPayment.en.body.replace("amount", data.payload.amount),
                eventMessages.successPayment.fr.body = eventMessages.successPayment.fr.body.replace("amount", data.payload.amount),
                handleNotification({
                    data,
                    eventName: "successful-payment",
                    fallbackMessage: eventMessages.successPayment
                })
            }
        );
        emitter.addEventListener(
            "incentive-bonus",
            function(data){
                eventMessages.addBonus.en.body = eventMessages.addBonus.en.body.replace("yy", data.payload.bonus),
                eventMessages.addBonus.fr.body = eventMessages.addBonus.fr.body.replace("yy", data.payload.bonus),
                handleNotification({
                    data,
                    eventName: "incentive-bonus",
                    fallbackMessage: eventMessages.addBonus
                })
            }
        );
        emitter.addEventListener(
            "bonus-withdrawal",
            function(data){
                eventMessages.removeBonus.en.body = eventMessages.removeBonus.en.body.replace("xx", data.payload.bonus),
                eventMessages.removeBonus.fr.body = eventMessages.removeBonus.fr.body.replace("xx", data.payload.bonus),
                handleNotification({
                    data,
                    eventName: "incentive-bonus",
                    fallbackMessage: eventMessages.removeBonus
                })
            }
        );
        emitter.addEventListener(
            "driver-position-update-failed",
            (data) => handleNotification({
                data,
                eventName: "itinerary-update-failed"
            })
        );
        nameSpace.use(socketAuthenticator());
        nameSpace.on("connection", handleConnection);
    };
}

module.exports = Object.freeze(deliveryMessageHandler);