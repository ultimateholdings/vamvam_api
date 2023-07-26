
const {Server} = require("socket.io");
const {socketAuthenticator} = require("../utils/middlewares");
const {isValidLocation} = require("../utils/helpers");
const { errors } = require("./config");


function getSocketManager ({deliveryModel, httpServer, userModel}) {
    const io = new Server(httpServer);
    const deliveries = io.of("/delivery");
    const connectedUsers = Object.create(null);
    
    function handleEnding(data) {
        const {clientId, deliveryId} = data;
        
        connectedUsers[clientId]?.emit("delivery-end", {deliveryId});
    }

    function handleAcceptation(data) {
        const {clientId, driver} = data;
        connectedUsers[clientId]?.emit("delivery-accepted", driver);
    }

    function handleCancellation(data) {
        const {driverId, delivery} = data;
        connectedUsers[driverId]?.emit(
            "delivery-cancelled",
            delivery.id
        );
    }


    async function positionUpdateHandler (socket, data) {
        let position;
        let interestedClients
        const {id} = socket.user;
        if (isValidLocation(data)) {
            if (Array.isArray(data)) {
                position = data.at(-1);
            } else {
                position = data;
            }
            position = {
                coordinates: [position.latitude, position.longitude],
                type: "Point",
            };
            await userModel?.update({position}, {where: {id}});
            interestedClients = await deliveryModel?.findAll({where: {
                driverId: id,
                status: "started"
            }});
            interestedClients = (interestedClients ?? []).map(
                (delivery) => delivery.clientId
            ).forEach(function(clientId) {
                connectedUsers[clientId]?.emit("new-position", data)
            });
            socket.emit("position-updated", position);
        } else {
            socket.emit("position-rejected", errors.invalidValues.message);
        }
    }
    deliveryModel?.addEventListener("delivery-end", handleEnding);
    deliveryModel?.addEventListener("delivery-accepted", handleAcceptation);
    deliveryModel?.addEventListener("delivery-cancelled", handleCancellation);
    deliveries.use(socketAuthenticator());
    io.use(socketAuthenticator(["admin"]));

    deliveries.on("connection", function (socket) {
        connectedUsers[socket.user.id] = socket;
        socket.on("disconnect", function () {
            delete connectedUsers[socket.user.id];
            socket.leave(socket.user.role);
        });
        socket.join(socket.user.role);
        socket.on("new-position", async function (data) {
            await positionUpdateHandler(socket, data);
        });
    });



    return Object.freeze({
        io,
        forwardMessage(id, eventName, data) {
            connectedUsers[id]?.emit(eventName, data);
        }
    });
}

module.exports = Object.freeze(getSocketManager);