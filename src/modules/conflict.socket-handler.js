/*jslint
node
*/
const {
    availableRoles: roles
} = require("../utils/config");
const {socketAuthenticator} = require("../utils/middlewares");

function conflictMessageHandler(emitter) {
    const connectedUsers = Object.create(null);
    return function conflictSocketHandler(socketServer) {
        const nameSpace = socketServer.of("/conflict");

        function handleConnection(socket) {
            connectedUsers[socket.user.id] = socket;
            socket.on("disconnect", function () {
                delete connectedUsers[socket.user.id];
                socket.leave(socket.user.role);
            });
            socket.join(socket.user.role);
        }

        function handleSolvedConflict(data) {
            const {assignerId, conflictId} = data;
            const eventName = "conflict-solved";
            if (connectedUsers[assignerId] !== undefined) {
                connectedUsers[assignerId].emit(eventName, conflictId);
            }
        }

        function handleNewConflict(data) {
            const eventName = "new-conflict";
            const room = roles.conflictManager;
            const {conflict} = data;
            nameSpace.in(room).emit(eventName, conflict);
        }

        emitter?.addEventListener("conflict-solved", handleSolvedConflict);
        emitter?.addEventListener("new-conflict", handleNewConflict);
        nameSpace.use(socketAuthenticator([roles.conflictManager]));
        nameSpace.on("connection", handleConnection);
    };
}

module.exports = Object.freeze(conflictMessageHandler);