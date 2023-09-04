/*jslint
node, nomen
*/
const { after, before, describe, it } = require("mocha");
const { assert } = require("chai");
const { Bundle, User, connection } = require("../src/models");
const {
  bundles,
  getToken,
  otpHandler,
  setupServer,
  syncUsers,
  users,
} = require("./fixtures/helper");
const { errors } = require("../src/utils/config");
describe("Bundle CRUD test", function () {
  let server;
  let app;
  let dbUsers;
  before(async function () {
    const tmp = setupServer(otpHandler);
    server = tmp.server;
    app = tmp.app;
  });

  beforeEach(async function () {
    await connection.sync({ force: true });
    dbUsers = await syncUsers(users, User);
    tokens = await Promise.all([
      getToken(app, dbUsers.goodUser.phone),
      getToken(app, dbUsers.firstDriver.phone),
      getToken(app, dbUsers.admin.phone)
    ]);
  });

  afterEach(async function () {
    await connection.drop();
  });

  after(function () {
    server.close();
  });
  it("should return all bunch", async function () {
    let response;
    let adminToken = await Promise.all([
      getToken(app, dbUsers.admin.phone),
    ]);
    const bunchs = await Bundle.bulkCreate(bundles);
    response = await app
      .get("/bundle")
      .set("authorization", "Bearer " + adminToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, bunchs.length);
  });
  it("should return a 200 status on valid propertices and 404 on invalid propertices", async function () {
    let response;
    response = await app
      .post("/bundle/new-bundle")
      .send(bundles[0])
      .set("authorization", "Bearer " + tokens[0]);
    assert.equal(response.status, errors.forbiddenAccess.status);
    response = await app
      .post("/bundle/new-bundle")
      .send(bundles[0])
      .set("authorization", "Bearer " + tokens[2]);
    assert.equal(response.status, 200);
  });
  it("should return bundle infos", async function () {
    let response;
    let bundle;
    let [userToken] = await Promise.all([
      getToken(app, dbUsers.goodUser.phone),
    ]);
    bundle = await Bundle.create(bundles[0]);
    const id = bundle.id;
    response = await app
      .get("/bundle/infos")
      .send({ id })
      .set("authorization", "Bearer " + userToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.id, id);
  });
  it("should edit bunch", async function () {
    let response;
    let bundle;
    let updateData;
    updateData = {
      title: "28 Livraisons",
      bonus: 1,
      point: 20,
      unitPrice: 300,
    };
    let adminToken = await Promise.all([
      getToken(app, dbUsers.admin.phone),
    ]);
    bundle = await Bundle.create(bundles[5]);
    updateData.id = bundle.id
    response = await app.post("/bundle/update")
    .send(updateData)
    .set("authorization", "Bearer " + adminToken);
    assert.equal(response.status, 200)
  });
  it("should delete bundle", async function(){
    let response;
    let bundle;
    let adminToken = await Promise.all([
      getToken(app, dbUsers.admin.phone),
    ]);
    bundle = await Bundle.create(bundles[5]);
    const id = bundle.id;
    response = await app
      .post("/bundle/delete")
      .send({ id })
      .set("authorization", "Bearer " + adminToken);
    assert.equal(response.status, 204);
  })
});