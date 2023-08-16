
const {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it
} = require("mocha");
const {assert} = require("chai");
const {Delivery, Message, Room, User, connection} = require("../src/models");
const {
  clientSocketCreator,
  listenEvent,
  getToken,
  otpHandler,
  postData,
  setupAuthServer,
  syncUsers,
  users
} = require("./fixtures/helper");
const getSocketManager = require("../src/utils/socket-manager");
const getDeliveryHandler = require("../src/modules/delivery.socket-handler");
const {errors} = require("../src/utils/config");
const {messages} = require("./fixtures/message.data");
const connectedUser = clientSocketCreator("delivery");

describe("Message test", function () {
  let server;
  let app;
  let dbUsers;
  let tokens;
  let room;

  before(async function () {
    const tmp = setupAuthServer(otpHandler);
    server = tmp.server;
    app = tmp.app;
    socketServer = getSocketManager({
        deliveryHandler: getDeliveryHandler(Delivery),
        httpServer: server
    });
  });

  beforeEach(async function () {
    await connection.sync({ force: true });
    dbUsers = await syncUsers(users, User);
    room = await Room.create({
      name: "Livraison pour bonandjo",
    });
    await room.setUsers([dbUsers.firstDriver, dbUsers.goodUser]);
    tokens = await Promise.all([
      getToken(app, dbUsers.goodUser.phone),
      getToken(app, dbUsers.firstDriver.phone),
    ]);
  messages[0].roomId = room.id;
  messages[1].roomId = room.id;
  });

  afterEach(async function () {
    await connection.drop();
  });

  after(function () {
    server.close();
  });
  it("should return Room Messages", async function () {
    await postData({
      app,
      data: messages[0],
      token: tokens[0],
      url: "/discussion/new-message"
    });
    await postData({
      app,
      data: messages[1],
      token: tokens[1],
      url: "/discussion/new-message",
    });
    let response = await app
    .get("/discussion/messages")
    .send({ roomId: room.id })
    .set("authorization", "Bearer " + tokens[1]);
    assert.equal(response.body.totalmessage, 2)
  });
  it("should provide user missed messages on connection", async function () {
    let data;
    let client;
    const driverMessage = Object.create(null);
    Object.assign(driverMessage, messages[0]);
    driverMessage.senderId = dbUsers.firstDriver.id;
    await Message.create(driverMessage);
    client = await connectedUser(tokens[0]);
    data = await listenEvent({name: "new-missed-messages", socket: client});
/*this assertion is made this way to avoid false negative introduced by date comparison*/
    assert.isTrue(data.roomId === room.id && data.messages.length === 1);
  });
});
