/*jslint
node
*/
const {
    availableRoles: roles
} = require("../utils/config");
const {socketAuthenticator} = require("../utils/middlewares");

function registrationMessageHandler(emitter) {
    const connectedUsers = Object.create(null);
    return function registrationSocketHandler(socketServer) {
        const nameSpace = socketServer.of("/registration");

        function handleConnection(socket) {
            connectedUsers[socket.user.id] = socket;
            socket.on("disconnect", function () {
                delete connectedUsers[socket.user.id];
                socket.leave(socket.user.role);
            });
            socket.join(socket.user.role);
        }

        function handleNewRegistration(data) {
            const eventName = "new-registration";
            const room = roles.registrationManager;
            nameSpace.in(room).emit(eventName, data);
        }

        emitter?.addEventListener("new-registration", handleNewRegistration);
        nameSpace.use(socketAuthenticator([roles.registrationManager]));
        nameSpace.on("connection", handleConnection);
    };
}

module.exports = Object.freeze(registrationMessageHandler);