const { before, after, describe, it } = require("mocha");
const { assert } = require("chai");
const { connection, User, Room, Message } = require("../src/models");
const {
  clientSocketCreator,
  getToken,
  otpHandler,
  syncUsers,
  users,
} = require("./fixtures/helper");
const {
  messages,
  messageHandler,
  setupMessageServer,
} = require("./fixtures/message.data");
const getSocketManager = require("../src/utils/socket-manager");
const { sendMessage } = messageHandler(getToken, Message);
const { errors } = require("../src/utils/config");
let room;

describe("Message interaction test", function () {
  let server;
  let app;
  let dbUsers;
  let socketServer;
  let socketGenerator = clientSocketCreator("delivery");

  before(async function () {
    const tmp = setupMessageServer(otpHandler);
    server = tmp.server;
    app = tmp.app;
    socketServer = getSocketManager({
      messageModel: Message,
      httpServer: server,
      userModel: User,
    });
    await connection.sync({ force: true });
    dbUsers = await syncUsers(users, User);
    room = await Room.create({
      name: "Livraison pour bonandjo",
    });
  });
  
  after(async function () {
    await connection.drop();
    await server.close();
    await socketServer.io.close();
  });

  it("should notify client when new message sending", async function () {
    messages[0].senderId = dbUsers.firstDriver.id;
    messages[0].roomId = room.id;
    let data;
    let [clientToken, driverToken] = await Promise.all([
      getToken(app, dbUsers.goodUser.phone),
      getToken(app, dbUsers.firstDriver.phone)
   ]);
    const client = await socketGenerator(clientToken);
    const driver = await socketGenerator(driverToken);
    client.emit("join-room", room.id);
    driver.emit("join-room", room.id);
    
    request = await app
      .post("/message/new-message")
      .send(messages[0])
      .set("authorization", "Bearer " + driverToken);
    data = await new Promise(function (res) {
      client.on("new-message", function (data) {
        client.close();
        res(data);
      });
    });
    assert.equal(data.messageId, request.body.messageId);
  });
});