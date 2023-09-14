/*jslint
node
*/

require("dotenv").config();
const nock = require("nock");
const { io } = require("socket.io-client");
const supertest = require("supertest");
const { buildServer } = require("../../src");
const authModule = require("../../src/modules/auth.module");
const userModule = require("../../src/modules/user.module");
const driverModule = require("../../src/modules/driver.module");
const buildAuthRoutes = require("../../src/routes/auth.route");
const buildUserRoutes = require("../../src/routes/user.route");
const driverRoutes = require("../../src/routes/driver.route");
const buildRouter = require("../../src/routes");
const { availableRoles, userStatuses } = require("../../src/utils/config");
const { jwtWrapper } = require("../../src/utils/helpers");
const jwt = jwtWrapper();
const users = {
  admin: {
    firstName: "Dima",
    lastName: "Padilla",
    phone: "+34489398439338434943",
    role: availableRoles.adminRole,
  },
  badUser: {
    firstName: "NKANG NGWET",
    lastName: "Presnel",
    phone: "+23909843850383534",
    role: availableRoles.clientRole,
  },
  conflictManager: {
    firstName: "Simplice",
    lastName: "Enoh",
    password: "aSimplePass",
    phone: "+2389004848393843934",
    role: availableRoles.conflictManager,
    status: userStatuses.activated,
  },
  firstDriver: {
    avatar: "/path/to/avatar2.jpg",
    firstName: "SOP",
    lastName: "Benoît",
    phone: "+00383998-7388-2423",
    role: availableRoles.driverRole,
    email: "support@ultimateholdingsinc.com"
  },
  goodUser: {
    avatar: "/path/to/avatar.jpg",
    firstName: "Tankoua",
    lastName: "Jean-christophe",
    phone: "+0038399873882423",
    role: availableRoles.clientRole,
  },
  registrationManager: {
    firstName: "Ngombi Yatie",
    lastName: "Terence",
    password: "aSimplePass",
    phone: "+23890048483938439897334",
    role: availableRoles.registrationManager,
    status: userStatuses.activated,
  },
  secondDriver: {
    firstName: "Fomekong Nguimtsa",
    internal: true,
    lastName: "Marc",
    phone: "+23809090909030943-039303",
    role: availableRoles.driverRole,
  },
  admin: {
    firstName: "Eyong",
    lastName: "Enow",
    phone: "+23809090909033487-039303",
    role: "admin",
  },
};
const subscriber = {
  age: "25-34",
  email: "foobaz@bar.com",
  firstName: "Nkang",
  gender: "M",
  lastName: "Lowe Plus",
  password: "+340239230932023234",
  phoneNumber: "+340239230932023234",
  role: "admin",
};
const pinIds = ["aewrjafk;9539", "121-dhjds-2330"];
const rooms = [
  {
    name: "livraison pour bonandjo.",
  },
  {
    name: "Livraison pour Bali",
  },
  {
    name: "Livraison pour djebale",
  },
  {
    name: "Livraison pour Mambanda",
  },
];
const messages = [
  {
    content:
      "Bonjour Mr Tankoua, Je m'appelle christian livreur vamvam, j'ai reçu" +
      "une demande de livraison pour bonandjo.",
  },
  {
    content: "Merci bonjour, je suis situe a litto labo, vallee bessingue",
  },
  {
    content: "Je suis point de recption du coli!",
  },
  {
    content: "J'arrive dans une minute.",
  },
];

const bundles = [
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

const webhookData = {
  event: "charge.completed",
  data: {
    id: 4582187,
    status: "successful",
    tx_ref: "transfer-1693586887811",
    flw_ref: "FLWTK43726MCK1693586888996",
    device_fingerprint: "N/A",
    amount: 3000,
    currency: "XAF",
    charged_amount: 3000,
    app_fee: 75,
    merchant_fee: 0,
    processor_response: "Transaction Successful"
  }
};
const otpHandler = {
  getTtl: () => 180,
  sendCode: () => Promise.resolve({verified: true}),
  verifyCode: () => Promise.resolve({verified: true})
};
function generateToken(user) {
  return jwt.sign({
    id: user.id,
    phone: user.phone,
    role: user.role,
  });
}

function setupInterceptor() {
  const otpBaseUrl = "https://api.ng.termii.com";
  const payment_url = "https://api.flutterwave.com";
  const { badUser, firstDriver, goodUser } = users;
  nock(payment_url)
      .post("/transaction/init-transaction")
      .reply(200)
      .persist();
  nock(payment_url)
      .post("/transaction/verify")
      .reply(200)
      .persist();
  nock(otpBaseUrl)
    .post(/otp\/send/, (body) => body.to === badUser.phone)
    .replyWithError("the network provider is not supported");
  nock(otpBaseUrl)
    .post(/otp\/send/, (body) =>
      Object.values(users)
        .slice(1)
        .map(function ({ phone }) {
          return phone;
        })
        .includes(body.to)
    )
    .reply(200, function (uri, requestBody) {
      if (requestBody.to === goodUser.phone) {
        return {
          phone: goodUser.phone,
          pinId: pinIds[0],
          uri,
        };
      } else {
        return {
          phone: firstDriver.phone,
          pinId: pinIds[1],
        };
      }
    })
    .persist();
  nock(otpBaseUrl)
    .post(/otp\/verify/, (body) => pinIds.includes(body.pin_id))
    .reply(200, function (uri, requestBody) {
      if (requestBody.pin_id === pinIds[0]) {
        return {
          msisdn: goodUser.phone,
          pinId: pinIds[0],
          uri,
          verified: true,
        };
      } else {
        return {
          msisdn: goodUser.phone,
          pinId: pinIds[1],
          verified: true,
        };
      }
    })
    .persist();
}

function clientSocketCreator(namespace, token) {
  const { API_PORT: port } = process.env;
  return new Promise(function (res, rej) {
    let client;
    let options = { forceNew: true };
    const url = "http://localhost:" + port + "/" + namespace;
    if (token !== null && token !== undefined) {
      options.extraHeaders = {
        authorization: "Bearer " + token,
      };
    }
    client = io(url, options);
    client.on("connect", function () {
      res(client);
    });
    client.on("connect_error", function (err) {
      rej(err);
    });
  });
}

async function getToken(app, phone, role) {
  const credentials = {
    code: "1234",
    phoneNumber: phone,
    role,
  };
  const response = await app.post("/auth/verify-otp").send(credentials);
  return response.body.token;
}

async function loginUser(app, phone, password) {
  const response = await app.post("/auth/login").send({
    password,
    phoneNumber: phone,
  });
  return response.body.token;
}
async function syncInstances(instances, model, primaryKey) {
  let dbInstances;
  let keyMap;
  if (Array.isArray(instances)) {
    return await model.bulkCreate(instances);
  }
  keyMap = Object.entries(instances).reduce(function (acc, [key, val]) {
    acc[val[primaryKey]] = key;
    return acc;
  }, Object.create(null));
  dbInstances = await model.bulkCreate(Object.values(instances), {
    individualHooks: true,
  });
  dbInstances = dbInstances.reduce(function (acc, instance) {
    acc[keyMap[instance[primaryKey]]] = instance;
    return acc;
  }, Object.create(null));
  return dbInstances;
}
async function syncUsers(users, model) {
  let dbUsers;
  const phoneMap = Object.entries(users).reduce(function (acc, [key, val]) {
    acc[val.phone] = key;
    return acc;
  }, {});
  dbUsers = await model.bulkCreate(Object.values(users), {
    individualHooks: true,
  });
  dbUsers = dbUsers.reduce(function (acc, user) {
    acc[phoneMap[user.phone]] = user;
    return acc;
  }, {});
  return dbUsers;
}

function setupServer(otpHandler) {
  const authRoutes = buildAuthRoutes(authModule({ otpHandler }));
  const userRoutes = buildUserRoutes(userModule({}));
  const server = buildServer(buildRouter({ authRoutes, userRoutes }));
  const app = supertest.agent(server);
  return Object.freeze({ app, server });
}

function registerDriver({ app, driver, token, url = "/driver/register" }) {
  const request = app
    .post(url)
    .field("phoneNumber", driver.phoneNumber)
    .field("lastName", driver.lastName)
    .field("firstName", driver.firstName)
    .field("password", driver.password)
    .field("email", driver.email)
    .field("age", driver.age)
    .field("gender", driver.gender);
  if (driver.carInfos) {
    request.attach("carInfos", driver.carInfos);
  }
  if (token) {
    request.set("authorization", "Bearer " + token);
  }
  return request;
}
function postData({ app, data, token, url }) {
  const request = app.post(url).send(data);
  if (typeof token === "string") {
    request.set("authorization", "Bearer " + token);
  }
  return request;
}
function getDatas({ app, data, token, url }) {
  const request = app.get(url);
  if (data) {
    request.send(data);
  }
  if (typeof token === "string") {
    request.set("authorization", "Bearer " + token);
  }
  return request;
}
function listenEvent({ close = true, name, socket, timeout = 1500 }) {
  return new Promise(function (res, rej) {
    socket.on(name, function (data) {
      if (close) {
        socket.close();
      }
      res(data);
    });
    setTimeout(function () {
      socket.close();
      rej("Timeout exceeded");
    }, timeout);
  });
}
module.exports = Object.freeze({
  bundles,
  clientSocketCreator,
  generateToken,
  getDatas,
  getToken,
  listenEvent,
  loginUser,
  messages,
  otpHandler,
  pinIds,
  postData,
  registerDriver,
  rooms,
  setupInterceptor,
  setupServer,
  subscriber,
  syncInstances,
  syncUsers,
  users,
  webhookData
});
