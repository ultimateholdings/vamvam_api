/*jslint node*/
require("dotenv").config();
const supertest = require("supertest");
const {buildServer} = require("../../src");
const buildRouter = require("../../src/routes");
const buildAuthRoutes = require("../../src/routes/auth.route");
const getAuthModule = require("../../src/modules/auth.module");

const deliveries = [
    {
        departure: {
            address: "Aphrodite Bonamoussadi",
            latitude: 4.0921257,
            longitude: 9.74284
        },
        destination: {
            address: "Nouvelle route Bonabassem",
            latitude: 4.0731928,
            longitude: 9.7133626
        },
        packageType: "Fragile",
        recipientInfos: {
            name: "Kamga Nouhou",
            otherPhones: ["+4399903940380", "+4309504i900054905"],
            phone: "+29820923023209932023"
        }
    },
    {
        departure: {
            address: "Cathédrale St Pierre et Paul de Bonadibong",
            latitude: 4.0470347,
            longitude: 9.6971706
        },
        destination: {
            address: "Tradex Rhône Poulenc, Douala",
            latitude: 4.0861186,
            longitude: 9.7578306
        },
        packageType: "Fragile",
        recipientInfos: {
            name: "Kam Massock",
            otherPhones: ["+23489489440380", "+430757848745934905"],
            phone: "+298209230988045023"
        }
    },
    {
        departure: {
            address: "Carrefour Logbessou",
            latitude: 4.0845127,
            longitude: 9.7806557
        },
        destination: {
            address: "Tribunal de premiere instance de bonaberi",
            latitude: 4.070708,
            longitude: 9.683527
        },
        packageType: "Fragile",
        recipientInfos: {
            name: "Mbouta Mbezoa",
            otherPhones: ["+7838349834940380", "+08308934900054905"],
            phone: "+273873489283203"
        }
    }
];

const badDelevery = {
    departure: {
        address: "Carrefour Logbessou",
        latitude: {a: 3},
        longitude: 9.7806557
    },
    destination: {
        address: "Tribunal de premiere instance de bonaberi",
        latitude: "testerw",
        longitude: 9.683527
    },
    recipientInfos: {
        name: "Mbouta Mbezoa",
        otherPhones: ["+7838349834940380", "+08308934900054905"],
        phone: "+273873489283203"
    }
};

const missoke = {latitude: 4.056436, longitude: 9.738848};
const positions = [
    {latitude: 4.063221, longitude: 9.733699},
    {latitude: 4.063414, longitude: 9.733162},
    {latitude: 4.063050, longitude: 9.732776}
];

function deliveryResquestor(tokenGetter, model) {

    async function fetchDelivery({app, data, phone, url}) {
        let token = await tokenGetter(app, phone);
        let response = await app.post(url).send(
            data
        ).set("authorization", "Bearer " + token);
        return {response, token};
    }
    async function requestDelivery({
        app,
        data,
        phone
    }) {
        let {response, token} = await fetchDelivery({
            app,
            data,
            phone,
            url: "/delivery/request"
        });
        response.body.token = token;
        response.body.status = response.status;
        return response.body;
    }

    async function setupDelivery({
        app,
        clientPhone,
        delivery,
        driverData,
        initialState
    }) {
        const request = await requestDelivery({
            app,
            data: delivery,
            phone: clientPhone
        });
        let token = await tokenGetter(app, driverData.phone);
        await model.update({
            driverId: driverData.id,
            status: initialState
        }, {
            where: {id: request.id}
        });
        return {driverToken: token, request};
    }

    return Object.freeze({requestDelivery, setupDelivery});
}

function setupDeliveryServer(otpHandler) {
    let app;
    let server;
    const authRoutes = buildAuthRoutes(getAuthModule({otpHandler}));
    server = buildServer(buildRouter({authRoutes}));
    app = supertest.agent(server);
    return Object.freeze({app, server});
}
module.exports = Object.freeze({
    badDelevery,
    deliveries,
    deliveryResquestor,
    missoke,
    positions,
    setupDeliveryServer
});