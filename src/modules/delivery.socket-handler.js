/*jslint
node
*/
const {errors, eventMessages} = require("../utils/system-messages");
const {socketAuthenticator} = require("../utils/middlewares");
const {availableRoles} = require("../utils/config");

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
                positionUpdateHandler(socket, tryParse(data));
            });
            socket.on("messages-read", function (data) {
                locationUpdateHandler(socket, data);
            });
            socket.on("itinerary-changed", function (data) {
                itineraryUpdateHandler(socket, tryParse(data));
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

        function itineraryUpdateHandler(socket, payload) {
            const {id, role} = socket.user;
            if (role === availableRoles.driverRole) {
                emitter.emitEvent(
                    "delivery-itinerary-update-requested",
                    {payload, userId: id}
                );
            } else {
                socket.emit(
                    "itinerary-update-failed",
                    errors.cannotPerformAction.message
                );
            }
        }

        function locationUpdateHandler(socket, data) {
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
            function (data) {
                const {payload} = data;
                const messagesEvent = eventMessages.withTransfomedBody(
                    eventMessages.failurePayment,
                    (body) => body.replace("amount", data.payload.amount)
                );
                payload.message = messagesEvent;
                handleNotification({
                    data,
                    eventName: "failure-payment",
                    fallbackMessage: messagesEvent
                });
            }
        );
        emitter.addEventListener(
            "successful-payment",
            function (data) {
                const {payload} = data;
                const messagesEvent = eventMessages.withTransfomedBody(
                    eventMessages.successPayment,
                    (body) => body.replace("amount", data.payload.amount)
                );
                payload.message = messagesEvent;
                handleNotification({
                    data,
                    eventName: "successful-payment",
                    fallbackMessage: messagesEvent
                });
            }
        );
        emitter.addEventListener(
            "incentive-bonus",
            function (data) {
                const {payload} = data;
                const messagesEvent = eventMessages.withTransfomedBody(
                    eventMessages.addBonus,
                    (body) => body.replace("number", data.payload.bonus)
                );
                payload.message = messagesEvent;
                handleNotification({
                    data,
                    eventName: "incentive-bonus",
                    fallbackMessage: messagesEvent
                });
            }
        );
        emitter.addEventListener(
            "bonus-withdrawal",
            function (data) {
                const {payload} = data;
                const messagesEvent = eventMessages.withTransfomedBody(
                    eventMessages.removeBonus,
                    (body) => body.replace("number", data.payload.bonus)
                );
                payload.message = messagesEvent;
                handleNotification({
                    data,
                    eventName: "bonus-widthdrawal",
                    fallbackMessage: messagesEvent
                });
            }
        );
        emitter.addEventListener(
            "driver-position-update-failed",
            (data) => handleNotification({
                data,
                eventName: "position-update-failed"
            })
        );
        emitter.addEventListener(
            "user-joined-room",
            (data) => handleNotification({
                data,
                eventName: "user-joined-room",
                fallbackMessage: eventMessages.withTransfomedBody(
                    eventMessages.userJoined,
                    (body) => body.replace(
                        "{userName}",
                        data.payload.user.firstName
                    ).replace("{roomName}", data.payload.room.name)
                )
            })
        );
        emitter.addEventListener(
            "delivery-archived",
            (data) => handleNotification({
                data,
                eventName: "delivery-archived",
                fallbackMessage: eventMessages.withTransfomedBody(
                    eventMessages.deliveryArchived,
                    (body, lang) => body.replace("{cause}", (
                        data.payload.cause !== undefined
                        ? data.payload.cause[lang]
                        : "N/A"
                    ))
                )
            })
        );
        emitter.addEventListener(
            "user-revocation-requested",
            function revocationHandler({userId}) {
                if (connectedUsers[userId] !== undefined) {
                    connectedUsers[userId].disconnect(true);
                }
            }
        );
        nameSpace.use(socketAuthenticator());
        nameSpace.on("connection", handleConnection);
    };
}

module.exports = Object.freeze(deliveryMessageHandler);