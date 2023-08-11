/*jslint
node
*/
require("dotenv").config();
const supertest = require("supertest");
const { buildServer } = require("../../src");
const subscriptionModule = require("../../src/modules/subscription.module");
const buildSubscriptionRoutes = require("../../src/routes/subscription.route");
const buildRouter = require("../../src/routes");
const buildAuthRoutes = require("../../src/routes/auth.route");
const getAuthModule = require("../../src/modules/auth.module");

const subscriptions = [
  {
    title: "10 Livraisons",
    bonus: 0,
    point: 10,
    unitPrice: 300,
  },
  {
    title: "15 Livraisons",
    bonus: 0,
    point: 15,
    unitPrice: 300,
  },
  {
    title: "20 Livraisons",
    bonus: 1,
    point: 20,
    unitPrice: 300,
  },
  {
    title: "25 Livraisons",
    bonus: 2,
    point: 25,
    unitPrice: 300,
  },
  {
    title: "35 Livraisons",
    bonus: 3,
    point: 35,
    unitPrice: 300,
  },
  {
    title: "40 Livraisons",
    bonus: 5,
    point: 40,
    unitPrice: 300,
  },
];

function subscriptionHandle(tokenGetter, model) {
  async function subscriptionCreate({ app, data, phone, url }) {
    let token = await tokenGetter(app, phone);
    let response = await app
      .post(url)
      .send(data)
      .set("authorization", "Bearer " + token);
    return { response, token };
  }
  async function postSubscription({ app, data, phone }) {
    let { response, token } = await subscriptionCreate({
      app,
      data,
      phone,
      url: "/subscription/new-subscription",
    });
    response.body.token = token;
    response.body.status = response.status;
    return response.body;
  }

  return Object.freeze({ postSubscription });
}

function setupSubscriptionServer(otpHandler) {
  let subscriptionRoutes;
  let app;
  let server;
  const authRoutes = buildAuthRoutes(getAuthModule({ otpHandler }));
  subscriptionRoutes = buildSubscriptionRoutes(subscriptionModule({}));
  server = buildServer(buildRouter({ authRoutes, subscriptionRoutes }));
  app = supertest.agent(server);
  return Object.freeze({ app, server });
}

module.exports = Object.freeze({
  subscriptions,
  subscriptionHandle,
  setupSubscriptionServer,
});
