/*jslint
node
*/

const nock = require("nock");
const {io: Client} = require("socket.io-client");
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
        const body = JSON.parse(requestBody);
        if (body.to === goodUser.phone) {
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
        const body = JSON.parse(requestBody);
        if (body.pin_id === pinIds[0]) {
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
        let client;
        let options = {};
        if (token !== null && token !== undefined ) {
            options.auth = {token};
        }
        client = new Client("http://localhost:3000/" + room, options);
        return client;
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

module.exports = Object.freeze({
    clientSocketCreator,
    getToken,
    pinIds,
    setupInterceptor,
    users
});