/*jslint
node, nomen
*/
const { after, afterEach, before, beforeEach, describe, it } = require("mocha");
const { assert } = require("chai");
const {
  Delivery,
  Bundle,
  connection,
  Transaction,
  User,
  Payment,
} = require("../src/models");
const {
  bundles,
  clientSocketCreator,
  listenEvent,
  getToken,
  otpHandler,
  setupServer,
  syncUsers,
  users,
  webhookData
} = require("./fixtures/helper");
const getSocketManager = require("../src/utils/socket-manager");
const getDeliveryHandler = require("../src/modules/delivery.socket-handler");
const { calculateSolde } = require("../src/utils/helpers");
const { response } = require("express");
describe("Transaction test", function () {
  let server;
  let app;
  let dbUsers;

  before(async function () {
    const tmp = setupServer(otpHandler);
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
    tokens = await Promise.all([
      getToken(app, dbUsers.goodUser.phone),
      getToken(app, dbUsers.firstDriver.phone),
      getToken(app, dbUsers.admin.phone),
    ]);
  });

  afterEach(async function () {
    await connection.drop();
  });

  after(async function () {
    socketServer.close();
    server.close();
  });
  it("should recharge with good props", async function () {
    let response;
    const { id: packId } = await Bundle.create(bundles[0]);
    const phoneNumber = "+237683411151";
    response = await app
      .post("/transaction/init-transaction")
      .send({ phoneNumber, packId })
      .set("authorization", "Bearer " + tokens[1]);
    assert.equal(response.status, 200);
  });
  it("should add bonus to driver", async function () {
    let response;
    let dataRequest = {
      driverId: dbUsers.firstDriver.id,
      bonus: 10,
      type: "recharge",
    };
    let driver = await clientSocketCreator("delivery", tokens[1]);
    response = await app
      .post("/transaction/handle-bonus")
      .send(dataRequest)
      .set("authorization", "Bearer " + tokens[2]);
    assert.equal(response.status, 200);
    data = await listenEvent({ name: "incentive-bonus", socket: driver });
    assert.equal(dataRequest.bonus, data.bonus);
  });
  it("should verify transaction", async function () {
    let response;
    let driver;
    const { id: packId } = await Bundle.create(bundles[0]);
    const { id: transId } = webhookData.data;
    await Payment.create({
      transId: transId,
      driverId: dbUsers.firstDriver.id,
      packId: packId,
    });
    response = await app
      .post("/transaction/verify")
      .send(webhookData)
      .set("authorization", "Bearer " + tokens[1])
      .set("verif-hash", "12345678918a2c836464vt-X");
    driver = await clientSocketCreator("delivery", tokens[0]);
    await listenEvent({ name: "successful-payment", socket: driver });
  });
  it("should return transaction history and wallet infos", async function () {
    let response;
    let transactions;
    let driverToken = await getToken(app, dbUsers.firstDriver.phone);

    transactions = bundles.map((bundle) => {
      const { unitPrice, bonus, point } = bundle;
      return {
        unitPrice,
        bonus,
        point,
        driverId: dbUsers.firstDriver.id,
        type: "recharge",
      };
    });
    const point = transactions
      .map((transaction) => transaction.point)
      .reduce((acc, curr) => acc + curr, 0);
    const bonus = transactions
      .map((transaction) => transaction.bonus)
      .reduce((acc, curr) => acc + curr, 0);
    const solde = calculateSolde(point, 300);
    await Transaction.bulkCreate(transactions);
    response = await app
      .get("/transaction/history")
      .send({ type: "recharge" })
      .set("authorization", "Bearer " + driverToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.length, transactions.length);
    response = await app
      .get("/transaction/wallet-infos")
      .set("authorization", "Bearer " + driverToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.wallet.bonus, bonus);
    assert.equal(response.body.wallet.point, point);
    assert.equal(response.body.wallet.solde, solde);
  });
  it("should return payment history", async function () {
    let response;
    let transactions = bundles.map((bundle) => {
      const { unitPrice, bonus, point } = bundle;
      return {
        unitPrice,
        bonus,
        point,
        driverId: dbUsers.firstDriver.id,
        type: "recharge",
      };
    });
    await Transaction.bulkCreate(transactions);
    response = await app
      .get("/transaction/payment-history")
      .send({
        startDate: 1693483365735,
        endDate: Date.now(),
        type: "recharge",
      })
      .set("authorization", "Bearer " + tokens[2]);
    assert.equal(response.status, 200);
    assert.equal(response.body.total, transactions.length);
  });
  it("should return recharge summer infos", async function () {
    let response;
    let transactions = bundles.map((bundle) => {
      const { unitPrice, bonus, point } = bundle;
      return {
        unitPrice,
        bonus,
        point,
        driverId: dbUsers.firstDriver.id,
        type: "recharge",
      };
    });
    const point = transactions
      .map((transaction) => transaction.point)
      .reduce((acc, curr) => acc + curr, 0);
    const bonus = transactions
      .map((transaction) => transaction.bonus)
      .reduce((acc, curr) => acc + curr, 0);
    const solde = calculateSolde(point, 300);
    await Transaction.bulkCreate(transactions);
    response = await app
      .get("/transaction/recharge-infos")
      .set("authorization", "Bearer " + tokens[2]);
    assert.equal(response.status, 200);
    assert.equal(response.body.bonus, bonus);
    assert.equal(response.body.point, point);
    assert.equal(response.body.solde, solde);
  });
});
