const { before, after, describe, it } = require("mocha");
const supertest = require("supertest");
const { assert } = require("chai");
const { connection, User, Room, Message } = require("../src/models");
const {
  getToken,
  otpHandler,
  syncUsers,
  users,
} = require("./fixtures/users.data");
const {
  messages,
  messageHandler,
  setupMessageServer,
} = require("./fixtures/message.data");
const { sendMessage } = messageHandler(getToken, Message);
const { errors } = require("../src/utils/config");
let room;

describe("Message test", function () {
  let server;
  let app;
  let dbUsers;

  before(async function () {
    const tmp = setupMessageServer(otpHandler);
    server = tmp.server;
    app = tmp.app;
  });

  beforeEach(async function () {
    await connection.sync({ force: true });
    dbUsers = await syncUsers(users, User);
    room = await Room.create({
      name: "Livraison pour bonandjo",
    });
  });

  afterEach(async function () {
    await connection.drop();
  });

  after(function () {
    server.close();
  });

  it("should provide the infos of a message", async function () {
    messages[0].senderId = dbUsers.goodUser.id;
    messages[0].roomId = room.id;
    const newMessage = await sendMessage({
      app,
      data: messages[0],
      phone: dbUsers.goodUser.phone,
    });
    let response = await app
      .get("/message/infos")
      .send({
        messageId: null,
      })
      .set("authorization", "Bearer " + newMessage.token);
    assert.equal(response.status, errors.notFound.status);
    response = await app
      .get("/message/infos")
      .send({
        messageId: "404error",
      })
      .set("authorization", "Bearer " + newMessage.token);
    assert.equal(response.status, errors.notFound.status);
    response = await app
      .get("/message/infos")
      .send({
        messageId: newMessage.messageId,
      })
      .set("authorization", "Bearer " + newMessage.token);
    assert.equal(response.status, 200);
    assert.equal(
      (response.body.messageId, response.body.senderId, response.body.roomId),
      (newMessage.messageId, newMessage.senderId, newMessage.roomId)
    );
  });
  it("should update message redear with userID", async function () {
    messages[0].senderId = dbUsers.goodUser.id;
    messages[0].roomId = room.id;
    const newMessage = await sendMessage({
      app,
      data: messages[0],
      phone: dbUsers.goodUser.phone,
    });
    const userId = dbUsers.firstDriver.id;
    const messageId = newMessage.messageId;
    let response = await app
      .post("/message/update-reader")
      .send({ messageId, userId })
      .set("authorization", "Bearer " + newMessage.token);
    assert.equal(response.status, 200);
    assert.equal(response.body.readerId, userId);
  })
  it("should return Room Messages", async function () {
    const roomId = room.id
    messages[0].senderId = dbUsers.goodUser.id;
    messages[0].roomId = roomId;
    messages[1].senderId = dbUsers.firstDriver.id;
    messages[1].roomId = roomId;
    const driverMessage = await sendMessage({
      app,
      data: messages[0],
      phone: dbUsers.goodUser.phone,
    });
    const clientMessage = await sendMessage({
      app,
      data: messages[1],
      phone: dbUsers.firstDriver.phone,
    });
    let response = await app
    .get("/message/room-messages")
    .send({ roomId })
    .set("authorization", "Bearer " + driverMessage.token);
    assert.equal(response.body.totalmessage, 2)
  });
});
