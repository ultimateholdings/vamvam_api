
const {Server} = require("socket.io");
const {socketAuthenticator} = require("../utils/middlewares");


function getSocketManager (httpServer) {
    const io = new Server(httpServer);
    const deliveries = io.of("/delivery");
    const connectedUsers = Object.create(null);
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
            if (connectedUsers[id] !== undefined) {
                connectedUsers[id].emit(eventName, data);
            }
        }
    });
}

module.exports = Object.freeze(getSocketManager);