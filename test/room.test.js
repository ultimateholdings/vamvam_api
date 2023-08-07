const { before, after, describe, it } = require("mocha");
const supertest = require("supertest");
const { assert, expect } = require("chai");
const { connection, User, Room, Message } = require("../src/models");
const {
  getToken,
  otpHandler,
  syncUsers,
  users,
} = require("./fixtures/users.data");
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

  after(async function () {
    await connection.drop();
    await server.close();
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
  it("should return user rooms with last message", async function () {
    phoneList = [dbUsers.goodUser.phone, dbUsers.firstDriver.phone];
    rooms[1].phoneList = phoneList;
    const newRoom = await createRoom({
      app,
      data: rooms[1],
      phone: dbUsers.goodUser.phone,
    });
    let response = await app
      .get("/room/user-rooms")
      .send({ userId: dbUsers.goodUser.id })
      .set("authorization", "Bearer " + newRoom.token);
      assert.equal(response.status, 200);
  });

  // it('should delete a room and its associated messages', async function(){
  //   const roomId = room.id;
  //   const roomsBeforeDeletion = await Room.findAll();
  //   const messagesBeforeDeletion = await Message.findAll();
  //   const roomsLength = roomsBeforeDeletion.length;
  //   const messagesLength = messagesBeforeDeletion.length;

  //   await app.delete(`/room/${roomId}`)

  //   const roomsAfterDeletion = await Room.findAll();
  //   const messagesAfterDeletion = await Message.findAll();

  //   expect(roomsBeforeDeletion).to.have.lengthOf(roomsLength);
  //   expect(messagesBeforeDeletion).to.have.lengthOf(messagesLength);
  //   expect(roomsAfterDeletion).to.have.lengthOf(roomsLength - 1);
  //   expect(messagesAfterDeletion).to.have.lengthOf(messagesLength - 1);
  // });
});
