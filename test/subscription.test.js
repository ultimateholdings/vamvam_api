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

  before(function () {
    const tmp = setupSubscriptionServer(otpHandler);
    server = tmp.server;
    app = tmp.app;
  });

  beforeEach(async function () {
    await connection.sync({ force: true });
    dbUsers = await syncUsers(users, User);
  });

  afterEach(async function () {
    await connection.drop();
  });

  after(function () {
    server.close();
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
    let [adminToken] = await Promise.all([
      getToken(app, dbUsers.subscriberAdmin.phone),
    ]);
    adminCreate = await postSubscription({
      app,
      data: subscriptions[1],
      phone: dbUsers.subscriberAdmin.phone,
    });
    const subscriptionId = adminCreate.id;
    response = await app
      .get("subscription/infos")
      .send({ subscriptionId })
      .set("authorization", "Bearer " + adminToken);
    assert.equal(response.status, 200);
  });
});
