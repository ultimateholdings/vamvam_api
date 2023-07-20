
const {Server} = require("socket.io");
const {socketAuthenticator} = require("../utils/middlewares");


function getSocketManager ({deliveryModel, httpServer, userModel}) {
    const io = new Server(httpServer);
    const deliveries = io.of("/delivery");
    const connectedUsers = Object.create(null);
    deliveryModel?.addEventListener("delivery-end", function (data) {
        debugger;
        const {clientId, deliveryId} = data;
        
        connectedUsers[clientId]?.emit("delivery-end", {deliveryId});
    })
    deliveries.use(socketAuthenticator());
    io.use(socketAuthenticator(["admin"]));

    deliveries.on("connection", function (socket) {
        connectedUsers[socket.user.id] = socket;
        socket.on("disconnect", function () {
            delete connectedUsers[socket.user.id];
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