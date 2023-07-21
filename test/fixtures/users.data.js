/*jslint
node
*/

require("dotenv").config();
const nock = require("nock");
const {io: Client} = require("socket.io-client");
const supertest = require("supertest");
const {buildServer} = require("../../src");
const authModule = require("../../src/modules/auth.module");
const userModule = require("../../src/modules/user.module");
const buildAuthRoutes = require("../../src/routes/auth.route");
const buildUserRoutes = require("../../src/routes/user.route");
const buildRouter = require("../../src/routes");
const users = {
    badUser: {
        firstName: "NKANG NGWET",
        lastName: "Presnel",
        phone: "+23909843850383534",
        role: "client"
    },
    firstDriver: {
        avatar: "/path/to/avatar2.jpg",
        firstName: "SOP",
        lastName: "Benoît",
        phone: "+00383998-7388-2423",
        role: "driver"
    },
    goodUser: {
        avatar: "/path/to/avatar.jpg",
        firstName: "Tankoua",
        lastName: "Jean-christophe",
        phone: "+0038399873882423",
        role: "client"
    },
    secondDriver: {
        firstName: "Fomekong Nguimtsa",
        lastName: "Marc",
        phone: "+23809090909030943-039303",
        role: "driver"
    }
};
const pinIds = ["aewrjafk;9539", "121-dhjds-2330"];
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
                verified: "True"
            };
        } else {
            return {
                msisdn: goodUser.phone,
                pinId: pinIds[1],
                verified: "True"
            };
        }
    }).persist();
}

function clientSocketCreator(room) {
    return function (token) {
        return new Promise(function(res, rej) {
            let client;
            let options = {};
            if (token !== null && token !== undefined) {
                options.auth = {token};
            }
            client = new Client("http://localhost:3000/" + room, options);
            client.on("connect", function () {
                res(client);
            });
            client.on("connect_error", function (err) {
                rej(err);
            })
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

async function syncUsers(users, model) {
    let dbUsers;
    const phoneMap = Object.entries(users).reduce(
        function (acc, [key, val]) {
            acc[val.phone] = key;
            return acc;
        },
        {}
    );
    dbUsers = await model.bulkCreate(Object.values(users));
    dbUsers = dbUsers.reduce(function (acc, user) {
        acc[phoneMap[user.phone]] = user;
        return acc;
    }, {});
    return dbUsers;
}

function setupAuthServer(otpHandler) {
    const authRoutes = buildAuthRoutes(authModule({otpHandler}));
    const userRoutes = buildUserRoutes(userModule({}))
    const server = buildServer(buildRouter({authRoutes, userRoutes}));
    const app = supertest.agent(server);
    return Object.freeze({app, server});
}

module.exports = Object.freeze({
    clientSocketCreator,
    getToken,
    otpHandler,
    pinIds,
    setupAuthServer,
    setupInterceptor,
    syncUsers,
    users
});