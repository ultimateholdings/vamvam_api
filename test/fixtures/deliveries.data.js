/*jslint node*/
require("dotenv").config();
const {apiSettings} = require("../../src/utils/config");
const packageTypes = apiSettings.delivery.defaultValues.delivery_packages;
const deliveries = [
    {
        departure: {
            address: "Aphrodite Bonamoussadi",
            latitude: 4.0921257,
            longitude: 9.74284
        },
        destination: {
            address: "Ndobo bonabéri",
            latitude: 4.077683,
            longitude: 9.650841
        },
        packageType: packageTypes[0].code,
        recipientInfos: {
            name: "Kamga Nouhou",
            otherPhones: ["+23909843850383534", "+4309504i900054905"],
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
        packageType: packageTypes[1].code,
        recipientInfos: {
            name: "Kam Massock",
            otherPhones: ["+23489489440380", "+430757848745934905"],
            phone: "+298209230988045023"
        }
    },
    {
        departure: {
            address: "Dibamba",
            latitude: 3.980695,
            longitude: 9.880883
        },
        destination: {
            address: "Bekoko",
            latitude: 4.113979,
            longitude: 9.579520
        },
        packageType: packageTypes[0].code,
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

function formatRecipientInfos(infos) {
    let result = {main: {}, others: []};
    result.main.name = infos?.name;
    result.main.phone = infos?.phone;
    if (Array.isArray(infos.otherPhones)) {
        infos.otherPhones.forEach(function (phone) {
            result.others.push({phone});
        });
    }
    return result;
}

function generateDBDeliveries({
    clientId,
    dbPointFormatter,
    driverId,
    initialState
}) {
    return deliveries.map(function (delivery, index) {
        const result = Object.create(null);
        Object.assign(result, delivery);
        result.departure = dbPointFormatter(delivery.departure);
        result.destination = dbPointFormatter(delivery.destination);
        result.deliveryMeta = {
            departureAddress: delivery.departure.address,
            destinationAddress: delivery.destination.address
        };
        result.price = 1000;
        result.clientId = clientId;
        result.driverId = driverId;
        result.status = (
            typeof initialState	=== "function"
            ? initialState(index)
            : initialState
        );
        result.code = "230293-sdfs";
        result.recipientInfos = formatRecipientInfos(result.recipientInfos);
        return result;
    });
}
module.exports = Object.freeze({
    badDelevery,
    deliveries,
    deliveryResquestor,
    generateDBDeliveries,
    missoke,
    positions
});