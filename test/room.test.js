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
const { rooms, roomHandler, setupRoomServer } = require("./fixtures/room.data");
const { messages } = require("./fixtures/message.data");
const { createRoom } = roomHandler(getToken, Room);
const { errors } = require("../src/utils/config");
let phoneList;

describe("Room Test", function () {
  let server;
  let app;
  let dbUsers;

  before(async function () {
    const tmp = setupRoomServer(otpHandler);
    server = tmp.server;
    app = tmp.app;
    await connection.sync({ force: true });
    dbUsers = await syncUsers(users, User);
  });

  
  it("should provide the infos of room", async function () {
    phoneList = [dbUsers.goodUser.phone, dbUsers.firstDriver.phone];
    rooms[0].phoneList = phoneList;
    const newRoom = await createRoom({
      app,
      data: rooms[0],
      phone: dbUsers.goodUser.phone,
    });
    let response = await app
      .get("/room/infos")
      .send({
        roomId: newRoom.roomId,
      })
      .set("authorization", "Bearer " + newRoom.token);
    assert.equal(response.status, 200);
    assert.equal(
      (newRoom.roomId, newRoom.name),
      (response.body.roomId, response.body.name)
    );
  });
  
  it("should return user miss message", async function () {
    let response;
    phoneList = [dbUsers.goodUser.phone, dbUsers.firstDriver.phone, dbUsers.secondDriver.phone];
    rooms[1].phoneList = phoneList;
    const newRoom = await createRoom({
      app,
      data: rooms[1],
      phone: dbUsers.goodUser.phone,
    });
    await Message.bulkCreate([
      {
        content: messages[0].content,
        senderId: dbUsers.firstDriver.id,
        roomId: newRoom.roomId,
        reader: dbUsers.firstDriver.id,
      },
      {
        content: messages[2].content,
        senderId: dbUsers.firstDriver.id,
        roomId: newRoom.roomId,
        reader: dbUsers.firstDriver.id,
      },
    ]);
    response = await app
      .get("/room/miss-message")
      .send({ userId: dbUsers.goodUser.id })
      .set("authorization", "Bearer " + newRoom.token);
    assert.equal(response.status, 200);
    assert.equal(response.body.data[0].missedCount, 2);
    response = await app
      .get("/room/miss-message")
      .send({ userId: dbUsers.firstDriver.id })
      .set("authorization", "Bearer " + newRoom.token);
    assert.equal(response.status, 200);
    assert.equal(response.body.data[0].missedCount, 0);
  });
  it("should delete a room and its associated messages", async function () {
    let response;
    phoneList = [dbUsers.goodUser.phone, dbUsers.firstDriver.phone];
    rooms[2].phoneList = phoneList;
    const newRoom = await createRoom({
      app,
      data: rooms[2],
      phone: dbUsers.goodUser.phone,
    });
    const roomId = newRoom.roomId;
    await Message.bulkCreate([
      {
        content: messages[0].content,
        senderId: dbUsers.firstDriver.id,
        roomId: roomId,
      },
      {
        content: messages[1].content,
        senderId: dbUsers.goodUser.id,
        roomId: roomId,
      },
    ]);
    response = await app
      .post("/room/delete")
      .send({ roomId })
      .set("authorization", "Bearer " + newRoom.token);
    assert.equal(response.status, 204);
  });
});
