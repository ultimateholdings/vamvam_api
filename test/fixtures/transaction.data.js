/*jslint
node
*/
require("dotenv").config();
const supertest = require("supertest");
const { buildServer } = require("../../src");
const rechargeModule = require("../../src/modules/transaction.module");
const buildRechargeRoutes = require("../../src/routes/transaction.route");
const buildRouter = require("../../src/routes");
const buildAuthRoutes = require("../../src/routes/auth.route");
const getAuthModule = require("../../src/modules/auth.module");

const recharges = [
  {
    bonus: 0,
    point: 10,
    amount: 3000
  },
  {
    bonus: 0,
    point: 15,
    amount: 4500
  },
  {
    bonus: 1,
    point: 20,
    amount: 6000
  },
  {
    bonus: 2,
    point: 25,
    amount: 7500
  },
  {
    bonus: 3,
    point: 35,
    amount: 10500
  },
  {
    bonus: 5,
    point: 40,
    amount: 12500
  },
];
const withdrawals = [
  {
    bonus: 0,
    point: 1,
    amount: 300,
    type: "withdrawal"
  },
  {
    bonus: 1,
    point: 0,
    amount: 300,
    type: "withdrawal"
  }
];

function setupRechargeServer(otpHandler) {
  let rechargeRoutes;
  let app;
  let server;
  const authRoutes = buildAuthRoutes(getAuthModule({ otpHandler }));
  rechargeRoutes = buildRechargeRoutes(rechargeModule({}));
  server = buildServer(buildRouter({ authRoutes, rechargeRoutes }));
  app = supertest.agent(server);
  return Object.freeze({ app, server });
}

module.exports = Object.freeze({
  recharges,
  withdrawals,
  setupRechargeServer
});