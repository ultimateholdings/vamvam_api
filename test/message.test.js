const { before, after, describe, it } = require("mocha");
const supertest = require("supertest");
const { assert } = require("chai");
const { connection, User, Room, Message } = require("../src/models");
const {
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
  it("should return Room Messages", async function () {
    const roomId = room.id
    messages[0].senderId = dbUsers.goodUser.id;
    messages[0].roomId = roomId;
    messages[1].senderId = dbUsers.firstDriver.id;
    messages[1].roomId = roomId;
    await room.setUsers([dbUsers.firstDriver, dbUsers.goodUser]);
    const driverMessage = await sendMessage({
      app,
      data: messages[0],
      phone: dbUsers.goodUser.phone,
    });
    await sendMessage({
      app,
      data: messages[1],
      phone: dbUsers.firstDriver.phone,
    });
    let response = await app
    .get("/discussion/messages")
    .send({ roomId })
    .set("authorization", "Bearer " + driverMessage.token);
    assert.equal(response.body.totalmessage, 2)
  });
});
