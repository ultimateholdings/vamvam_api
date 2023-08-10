/*jslint
node
*/
const {Server} = require("socket.io");
const {socketAuthenticator} = require("../utils/middlewares");
const {availableRoles} = require("./config");


function getSocketManager({conflictHandler, deliveryHandler, httpServer}) {
    const io = new Server(httpServer);
    const connectedUsers = Object.create(null);

    function handleConnection(socket) {
        connectedUsers[socket.user.id] = socket;
        socket.on("disconnect", function () {
            delete connectedUsers[socket.user.id];
            socket.leave(socket.user.role);
        });
        socket.join(socket.user.role);
    }

    if (typeof deliveryHandler === "function") {
        deliveryHandler(io);
    }
    if (typeof conflictHandler === "function") {
        conflictHandler(io);
    }

    io.use(socketAuthenticator([availableRoles.adminRole]));
    io.on("connection", handleConnection);
    
    function close() {
        io.close();
    }
    return Object.freeze({
        close
    });
}

module.exports = Object.freeze(getSocketManager);