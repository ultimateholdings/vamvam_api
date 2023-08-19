/*jslint
node
*/

require("dotenv").config();
const nock = require("nock");
const {
    io: Client
} = require("socket.io-client");
const supertest = require("supertest");
const {buildServer} = require("../../src");
const authModule = require("../../src/modules/auth.module");
const userModule = require("../../src/modules/user.module");
const driverModule = require("../../src/modules/driver.module");
const buildAuthRoutes = require("../../src/routes/auth.route");
const buildUserRoutes = require("../../src/routes/user.route");
const driverRoutes = require("../../src/routes/driver.route");
const buildRouter = require("../../src/routes");
const {availableRoles, userStatuses} = require("../../src/utils/config");
const users = {
    badUser: {
        firstName: "NKANG NGWET",
        lastName: "Presnel",
        phone: "+23909843850383534",
        role: availableRoles.clientRole
    },
    conflictManager: {
        firstName: "Simplice",
        lastName: "Enoh",
        password: "aSimplePass",
        phone: "+2389004848393843934",
        role: availableRoles.conflictManager,
        status: userStatuses.activated
    },
    firstDriver: {
        avatar: "/path/to/avatar2.jpg",
        firstName: "SOP",
        lastName: "Benoît",
        phone: "+00383998-7388-2423",
        role: availableRoles.driverRole
    },
    goodUser: {
        avatar: "/path/to/avatar.jpg",
        firstName: "Tankoua",
        lastName: "Jean-christophe",
        phone: "+0038399873882423",
        role: availableRoles.clientRole
    },
    registrationManager: {
        firstName: "Ngombi Yatie",
        lastName: "Terence",
        password: "aSimplePass",
        phone: "+23890048483938439897334",
        role: availableRoles.registrationManager,
        status: userStatuses.activated
    },
    secondDriver: {
        firstName: "Fomekong Nguimtsa",
        internal: true,
        lastName: "Marc",
        phone: "+23809090909030943-039303",
        role: availableRoles.driverRole
    }
};
const subscriber = {
    age: "25-34",
    email: "foobaz@bar.com",
    firstName: "Nkang",
    gender: "M",
    lastName: "Lowe Plus",
    password: "+340239230932023234",
    phoneNumber: "+340239230932023234",
    role: "admin"
};
const pinIds = ["aewrjafk;9539", "121-dhjds-2330"];
const rooms = [
    {
      name: "livraison pour bonandjo."
    },
    {
      name: "Livraison pour Bali"
    },
    {
      name: "Livraison pour djebale"
    },
    {
      name: "Livraison pour Mambanda"
    },
];
const messages = [
    {
      content:
        "Bonjour Mr Tankoua, Je m'appelle christian livreur vamvam, j'ai reçu" +
        "une demande de livraison pour bonandjo."
    },
    {
      content: "Merci bonjour, je suis situe a litto labo, vallee bessingue"
    },
    {
      content: "Je suis point de recption du coli!"
    },
    {
      content: "J'arrive dans une minute."
    },
  ];
const otpHandler = {
    sendCode: () => Promise.resolve({verified: true}),
    verifyCode: () => Promise.resolve({verified: true})
};


function setupInterceptor() {
    const otpBaseUrl = "https://api.ng.termii.com";
    const {badUser, firstDriver, goodUser} = users;
    nock(otpBaseUrl).post(
        /otp\/send/,
        (body) => body.to === badUser.phone
    ).replyWithError("the network provider is not supported");
    nock(otpBaseUrl).post(
        /otp\/send/,
        (body) => Object.values(users).slice(1).map(
            function ({phone}) {
                return phone;
            }
        ).includes(body.to)
    ).reply(200, function (uri, requestBody) {
        if (requestBody.to === goodUser.phone) {
            return {
                phone: goodUser.phone,
                pinId: pinIds[0],
                uri
            };
        } else {
            return {
                phone: firstDriver.phone,
                pinId: pinIds[1]
            };
        }
    }).persist();
    nock(otpBaseUrl).post(
        /otp\/verify/,
        (body) => pinIds.includes(body.pin_id)
    ).reply(200, function (uri, requestBody) {
        if (requestBody.pin_id === pinIds[0]) {
            return {
                msisdn: goodUser.phone,
                pinId: pinIds[0],
                uri,
                verified: true
            };
        } else {
            return {
                msisdn: goodUser.phone,
                pinId: pinIds[1],
                verified: true
            };
        }
    }).persist();
}

function clientSocketCreator(room) {
    const {
        API_PORT: port
    } = process.env;
    return function (token) {
        return new Promise(function (res, rej) {
            let client;
            let options = {};
            if (token !== null && token !== undefined) {
                options.auth = {token};
            }
            client = new Client(
                "ws://localhost:" + port + "/" + room,
                options
            );
            client.on("connect", function () {
                res(client);
            });
            client.on("connect_error", function (err) {
                rej(err);
            });
        });
    };
}

async function getToken(app, phone, role) {
    const credentials = {
        code: "1234",
        phoneNumber: phone,
        role
    };
    const response = await app.post("/auth/verify-otp").send(credentials);
    return response.body.token;
}

async function loginUser(app, phone, password) {
    const response = await app.post("/auth/login").send({
        password,
        phoneNumber: phone
    });
    return response.body.token;
}

async function syncUsers(users, model) {
    let dbUsers;
    const phoneMap = Object.entries(users).reduce(
        function (acc, [key, val]) {
            acc[val.phone] = key;
            return acc;
        },
        {}
    );
    dbUsers = await model.bulkCreate(Object.values(users), {
        individualHooks: true
    });
    dbUsers = dbUsers.reduce(function (acc, user) {
        acc[phoneMap[user.phone]] = user;
        return acc;
    }, {});
    return dbUsers;
}

function setupAuthServer(otpHandler) {
    const authRoutes = buildAuthRoutes(authModule({otpHandler}));
    const userRoutes = buildUserRoutes(userModule({}));
    const server = buildServer(buildRouter({authRoutes, userRoutes}));
    const app = supertest.agent(server);
    return Object.freeze({app, server});
}

function setupDriverServer(otpHandler) {
    const authRoutes = buildAuthRoutes(authModule({otpHandler}));
    const registrationRoutes = driverRoutes(driverModule({}));
    const server = buildServer(buildRouter({authRoutes, registrationRoutes}));
    const app = supertest.agent(server);
    return Object.freeze({app, server});
}

function registerDriver({app, driver, token, url = "/driver/register"}) {
    const request = app.post(url).field(
        "phoneNumber",
        driver.phoneNumber
    ).field("lastName", driver.lastName).field(
        "firstName",
        driver.firstName
    ).field("password", driver.password).field(
        "email",
        driver.email
    ).field("age", driver.age).field(
        "gender",
        driver.gender
    );
    if (driver.carInfos) {
        request.attach("carInfos", driver.carInfos);
    }
    if (token) {
        request.set("authorization", "Bearer " + token);
    }
    return request;
}
function postData({app, data, token, url}) {
    const request = app.post(url).send(data);
    if (typeof token === "string") {
        request.set("authorization", "Bearer " + token);
    }
    return request;
}
function getDatas({app, data, token, url}) {
    const request = app.get(url);
    if (data) {
        request.send(data);
    }
    if (typeof token === "string") {
        request.set("authorization", "Bearer " + token);
    }
    return request;
}
function listenEvent({
    close = true,
    name,
    socket,
    timeout = 1500
}) {
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
    clientSocketCreator,
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
    setupAuthServer,
    setupDriverServer,
    setupInterceptor,
    subscriber,
    syncUsers,
    users
});