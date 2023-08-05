const { before, beforeEach, after, afterEach, describe, it } = require("mocha");
const supertest = require("supertest");
const { expect, assert} = require("chai");
const { connection, User, Room, Message } = require("../src/models");
const { buildServer } = require("../src");
const roomModule = require("../src/modules/room.module");
const buildRoomRoutes = require("../src/routes/room.route");
const buildRouter = require("../src/routes");
const Sequelize = require("sequelize");
const { in: opIn } = Sequelize.Op;
const content = "Je suis au point de livraison.";
const roomName = "Livraison pour bonandjo";
let sender;
let receiver;
let driver;
let room;
let room2;
let message;
let message2;

describe("Room Test", function () {
  let server;
  let app;

  before(async function () {
    let roomRoutes;

    roomRoutes = buildRoomRoutes(roomModule({}));
    server = buildServer(buildRouter({ roomRoutes }));
    app = supertest.agent(server);
    await connection.sync({ force: true });
  });

  before(async function () {
    sender = await User.create({ phone: "+0038399873882423" });
    receiver = await User.create({ phone: "+0038399873882424" });
    driver = await User.create({ phone: "+0038399873882426" });
    room = await Room.create({ name: "Livraison pour Mambanda"});
    room2 = await Room.create({ name: "Livraison pour Bali"});
    await room.addUser(sender);
    await room.addUser(receiver);
    await room2.addUser(sender);
    message = await Message.create({
      senderId: sender.id,
      roomId: room.id,
      content: content,
    })
  });

  after(async function () {
    await connection.drop();
    await server.close();
  });

  it("should create room", async function(){
    const phoneList = [ sender.phone, receiver.phone, driver.phone ];
    let response = await app.post("/room/new-room").send({
        name: roomName,
        phoneList: phoneList
    });
    expect(response.status).to.equal(200);
  });

  it("should return to the room with associated messages and users", async function(){
    const roomId = room.id;
    let response = await app.get(`/room/${roomId}`);
    expect(response.status).to.equal(200);
    expect(response.body.data).to.be.an("object");
    expect(response.body.data).to.have.property("room");
    expect(response.body.data).to.have.property("users");
  }); 

  it("should return user rooms", async function(){
    const userId = sender.id;
    let response = await app.get(`/room/user-rooms/${userId}`);
    expect(response.status).to.equal(200);
    expect(response.body.data.length).to.equal(3)
  });

  it('should delete a room and its associated messages', async function(){
    const roomId = room.id;
    const roomsBeforeDeletion = await Room.findAll();
    const messagesBeforeDeletion = await Message.findAll();
    const roomsLength = roomsBeforeDeletion.length;
    const messagesLength = messagesBeforeDeletion.length;

    await app.delete(`/room/${roomId}`)

    const roomsAfterDeletion = await Room.findAll();
    const messagesAfterDeletion = await Message.findAll();

    expect(roomsBeforeDeletion).to.have.lengthOf(roomsLength);
    expect(messagesBeforeDeletion).to.have.lengthOf(messagesLength);
    expect(roomsAfterDeletion).to.have.lengthOf(roomsLength - 1);
    expect(messagesAfterDeletion).to.have.lengthOf(messagesLength - 1);
  });
});
