/*jslint
node, nomen
*/
const { after, before, describe, it } = require("mocha");
const { assert } = require("chai");
const { Transaction, Subscription, User, connection } = require("../src/models");
const {
  getToken,
  otpHandler,
  syncUsers,
  users,
} = require("./fixtures/users.data");
const {
  recharges,
  withdrawals,
  setupRechargeServer,
} = require("./fixtures/transaction.data");
const { subscriptions } = require("./fixtures/subscriptions.data");
const { errors } = require("../src/utils/config");
describe("Transaction test", function () {
  let server;
  let app;
  let dbUsers;
  before(async function () {
    const tmp = setupRechargeServer(otpHandler);
    server = tmp.server;
    app = tmp.app;
    await connection.sync({ force: true });
    dbUsers = await syncUsers(users, User);
  });
  it("should recharge with good props", async function () {
    let response;
    let driverToken = await Promise.all([
      getToken(app, dbUsers.firstDriver.phone),
    ]);
    let pack = await Subscription.create(subscriptions[0])
    const payload = {
      phone_number: '+237683411151',
      amount: 3000,
      email: "support@ultimateholdingsinc.com",
      fullname: dbUsers.firstDriver.firstName
    }
    recharges[0].phone_number = dbUsers.firstDriver.phone;
    recharges[0].packId = pack.id;
    recharges[0].payload = payload;
    response = await app
      .post("/transaction/init-transaction")
      .send(recharges[0])
      .set("authorization", "Bearer " + driverToken);
    assert.equal(response.status, 200);
  });
  it("should return transaction history", async function () {
    let response;
    let driverToken = await Promise.all([
      getToken(app, dbUsers.firstDriver.phone),
    ]);
    response = await app
      .get("/transaction/history")
      .set("authorization", "Bearer " + driverToken);
    assert.equal(response.status, 200);
  });
  it("should return wallet infos", async function () {
    let response;
    let driverToken = await Promise.all([
      getToken(app, dbUsers.firstDriver.phone),
    ]);
    response = await app
      .get("/transaction/wallet")
      .set("authorization", "Bearer " + driverToken);
    assert.equal(response.status, 200);
  });
});