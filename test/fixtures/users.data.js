const nock = require("nock");
const users = {
    goodUser: {
        avatar: "/path/to/avatar.jpg",
        firstName: "Tankoua",
        lastName: "Jean-christophe",
        phone: "+0038399873882423",
        role: "client"
    },
    secondUser: {
        avatar: "/path/to/avatar2.jpg",
        firstName: "SOP",
        lastName: "Benoît",
        phone: "+00383998-7388-2423",
        role: "driver"
    },
    badUser: {
        firstName: "NKANG NGWET",
        lastName: "Presnel",
        phone: "+23909843850383534",
        role: "client"
    }
};
const pinIds = ["aewrjafk;9539", "121-dhjds-2330"];


function setupInterceptor () {
    const otpBaseUrl = "https://api.ng.termii.com";
    const {goodUser, secondUser, badUser} = users;
    nock(otpBaseUrl).post(
        /otp\/send/,
        (body) => body.to === badUser.phone
    ).replyWithError("the network provider is not supported");
    nock(otpBaseUrl).post(
        /otp\/send/,
        (body) => Object.values(users).slice(0, 2).map(({phone}) => phone).includes(body.to)
    ).reply(200, function (uri, requestBody) {
        const body = JSON.parse(requestBody);
        if (body.to === goodUser.phone) {
            return {pinId: pinIds[0], phone: goodUser.phone, uri};
        } else {
            return {pinId: pinIds[1], phone: secondUser.phone};
        }
    }).persist();
    nock(otpBaseUrl).post(
        /otp\/verify/,
        (body) => pinIds.includes(body.pin_id)
    ).reply(200, function (uri, requestBody) {
        const body = JSON.parse(requestBody);
        if (body.pin_id === pinIds[0]) {
            return {
                pinId: pinIds[0],
                verified: "True",
                msisdn: goodUser.phone,
                uri
            };
        } else {
            return {
                pinId: pinIds[1],
                verified: "True",
                msisdn: goodUser.phone
            };
        }
    }).persist();
}

module.exports = Object.freeze({
    users,
    pinIds,
    setupInterceptor
});