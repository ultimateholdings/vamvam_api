/*jslint
node, nomen
*/
require("dotenv").config();
const {
    after,
    afterEach,
    before,
    beforeEach,
    describe,
    it
} = require("mocha");
const {assert} = require("chai");
const {
    Delivery,
    Settings,
    User,
    connection
} = require("../src/models");
const {apiSettings, deliveryStatuses} = require("../src/utils/config");
const {toDbPoint} = require("../src/utils/helpers");
const {deliveries} = require("./fixtures/deliveries.data");
const {
    generateToken,
    otpHandler,
    postData,
    setupServer,
    users,
    syncInstances
} = require("./fixtures/helper");

function generateDBDeliveries({
    clientId,
    driverId,
    initialState = deliveryStatuses.cancelled
}) {
    return deliveries.map(function (delivery) {
        const result = Object.create(null);
        Object.assign(result, delivery);
        result.departure = toDbPoint(delivery.departure);
        result.destination = toDbPoint(delivery.destination);
        result.deliveryMeta = {
            departureAdress: delivery.departure.address,
            destinationAdress: delivery.destination.address
        };
        result.price = 1000;
        result.clientId = clientId;
        result.driverId = driverId;
        result.status = initialState;
        return result;
    });
}
const newAdmins = [
    {
        phoneNumber: "+234093059540955",
        email: "aMail@vamvamlogistics.com",
        password: "heyneverthinkofit"
    },
    {
        phoneNumber: "+342098403984398439579398",
        email: "foobar@vamvamlogistics.com",
        password: "justguesswhat"
    },
]
describe("admin features tests", function () {
    let app;
    let server;
    let dbUsers;
    let deliveryGenerator;
    before(function () {
        const tmp = setupServer(otpHandler);
        app = tmp.app;
        server = tmp.server;
    });
    after(function () {
        server.close();
    });
    beforeEach(async function () {
        dbUsers = await connection.sync();
        dbUsers = await syncInstances(users, User, "phone");
        dbUsers = Object.entries(dbUsers).reduce(function (acc, [key, user]) {
            const clonedUser = Object.create(null);
            Object.assign(clonedUser, user.dataValues);
            clonedUser.token = generateToken(clonedUser);
            acc[key] = clonedUser;
            return acc;
        }, Object.create(null));
        await Settings.create({
            type: apiSettings.delivery.value,
            value: {"driver_search_radius": 2000}
        });
        deliveryGenerator = (initialState) => generateDBDeliveries({
            clientId: dbUsers.goodUser.id,
            driverId: dbUsers.firstDriver.id,
            initialState
        });
    });
    afterEach(async function () {
        await connection.drop();
    });
    it("should create a registration", async function () {
        let response;
        let data = newAdmins[0];
        data.type = "registration";
        response = await postData({
            app,
            data,
            token: dbUsers.admin.token,
            url: "/admin/new-admin"
        });
        assert.equal(response.status, 200);
    });
    it("should provide the list of user", async function () {
        let response = await app.get(
            "/user/all?maxPageSize=3"
        ).set("authorization", "Bearer " + dbUsers.admin.token);
        assert.equal(response.status, 200);
        response = await app.get(
            "/user/all?maxPageSize=3"
        ).set("authorization", "Bearer " + dbUsers.admin.token)
        .set("page-token", response.body.nextPageToken);
        assert.deepEqual(response.body.results.length, 3);
    });
    it("should provide the list of ongoing deliveries", async function () {
        let response;
        let deliveries = [
            ...deliveryGenerator(deliveryStatuses.cancelled),
            ...deliveryGenerator(deliveryStatuses.started)
        ];
        await Delivery.bulkCreate(deliveries);
        response =
        await app.get("/delivery/analytics")
        .set("authorization", "Bearer " + dbUsers.admin.token);
        assert.equal(response.status, 200);
    });
    it("should update a setting", async function () {
        let data = {
            type: "delivery",
            value: {ttl: 5500}
        }
        let response = await postData({
            app,
            data,
            url: "/admin/update-settings",
            token: dbUsers.admin.token
        });
        assert.equal(response.body.updated, true);
    });
});