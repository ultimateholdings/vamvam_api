/*jslint
node, nomen
*/
const { after, afterEach, before, beforeEach, describe, it } = require("mocha");
const { assert } = require("chai");
const { Subscription, User, connection } = require("../src/models");
const {
  getToken,
  otpHandler,
  syncUsers,
  users,
} = require("./fixtures/users.data");
const {
  subscriptions,
  subscriptionHandle,
  setupSubscriptionServer,
} = require("./fixtures/subscriptions.data");
const { errors } = require("../src/utils/config");
const { postSubscription } = subscriptionHandle(getToken, Subscription);
describe("Subscription CRUD test", function () {
  let server;
  let app;
  let dbUsers;
  before(async function () {
    const tmp = setupSubscriptionServer(otpHandler);
    server = tmp.server;
    app = tmp.app;
    await connection.sync({ force: true });
    dbUsers = await syncUsers(users, User);
  });
  after(async function () {
    await connection.drop();
    await server.close();
  });
  it("should return all bunch", async function () {
    let response;
    let adminToken = await Promise.all([
      getToken(app, dbUsers.subscriberAdmin.phone),
    ]);
    const bunchs = await Subscription.bulkCreate(subscriptions);
    response = await app
      .get("/subscription")
      .set("authorization", "Bearer " + adminToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, subscriptions.length);
  });
  it("should return a 200 status on valid propertices and 404 on invalid propertices", async function () {
    let [userToken, adminToken] = await Promise.all([
      getToken(app, dbUsers.goodUser.phone),
      getToken(app, dbUsers.subscriberAdmin.phone),
    ]);
    let response = await app
      .post("/subscription/new-subscription")
      .send(subscriptions[0])
      .set("authorization", "Bearer " + userToken);
    assert.equal(response.status, errors.notAuthorized.status);
    response = await app
      .post("/subscription/new-subscription")
      .send(subscriptions[0])
      .set("authorization", "Bearer " + adminToken);
    assert.equal(response.status, 200);
  });
  it("should return subscription infos", async function () {
    let response;
    let adminCreate;
    let [userToken] = await Promise.all([
      getToken(app, dbUsers.goodUser.phone),
    ]);
    adminCreate = await postSubscription({
      app,
      data: subscriptions[1],
      phone: dbUsers.subscriberAdmin.phone,
    });
    const subscriptionId = adminCreate.data.subscriptionId;
    response = await app
      .get("/subscription/infos")
      .send({ subscriptionId })
      .set("authorization", "Bearer " + userToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.subscriptionId, adminCreate.data.subscriptionId);
  });
  it("should edit bunch", async function () {
    let response;
    let subscription;
    let updateData;
    updateData = {
      title: "28 Livraisons",
      bonus: 1,
      point: 20,
      unitPrice: 300,
    };
    let adminToken = await Promise.all([
      getToken(app, dbUsers.subscriberAdmin.phone),
    ]);
    subscriptions[5].price = 6000,
    subscriptions[5].gainMin = 20000
    subscription = await Subscription.create(subscriptions[5]);
    updateData.subscriptionId = subscription.id
    response = await app.post("/subscription/update")
    .send(updateData)
    .set("authorization", "Bearer " + adminToken);
    assert.equal(response.status, 200)
  });
  it("should delete subscription", async function(){
    let response;
    let subscription;
    let adminToken = await Promise.all([
      getToken(app, dbUsers.subscriberAdmin.phone),
    ]);
    subscriptions[5].price = 6000,
    subscriptions[5].gainMin = 20000
    subscription = await Subscription.create(subscriptions[5]);
    const subscriptionId = subscription.id;
    response = await app
      .post("/subscription/delete")
      .send({ subscriptionId })
      .set("authorization", "Bearer " + adminToken);
    assert.equal(response.status, 204);
  })
});