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
    Sponsor,
    Sponsorship,
    User,
    connection
} = require("../src/models");
const {apiSettings, deliveryStatuses} = require("../src/utils/config");
const {generateCode, toDbPoint} = require("../src/utils/helpers");
const {generateDBDeliveries} = require("./fixtures/deliveries.data");
const {
    generateToken,
    getDatas,
    otpHandler,
    postData,
    setupServer,
    users,
    subscriber,
    syncInstances
} = require("./fixtures/helper");

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
            dbPointFormatter: toDbPoint,
            driverId: dbUsers.firstDriver.id,
            initialState
        });
    });
    afterEach(async function () {
        await connection.drop();
    });
    it("should create a registration manager", async function () {
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

describe("sponsoring tests", function () {
   let app;
   const data = {
       name: "Trésor Dima",
       phone: "3434343443",
       code: "12345"
   };
   let server;
   let admin;
   let allUsers;
   let sponsors = [users.firstDriver, users.secondDriver];
   before(function () {
       const tmp = setupServer();
       app = tmp.app;
       server = tmp.server;
   });
   after(function () {
       server.close();
   });
   beforeEach(async function () {
        allUsers = Array(10).fill(subscriber).map(function (user) {
            const result = {};
            const id = "-" + Math.floor(10000000 * Math.random());
            Object.assign(result, user);
            result.phone = result.phoneNumber + id;
            result.firstName += id;
            result.email = result.email.replace("@bar", id + "@bar");
            return result;
        });
        await connection.sync();
        admin = await User.create(users.admin);
        admin.token = generateToken(admin);
        allUsers = await User.bulkCreate(allUsers);
        sponsors = await Sponsor.bulkCreate(sponsors.map(function (user) {
            user.code = "" + Math.floor(1000 * Math.random());
            return user;
        }));
        Sponsorship.bulkCreate(allUsers.map(function (user, index) {
            if (index % 3 === 0) {
                return {sponsorId: sponsors[0].id, userId: user.id}
            }
            return {sponsorId: sponsors[1].id, userId: user.id};
        }));
   });
   afterEach(async function () {
       await connection.drop();
   });
   it("should create a new sponsor", async function () {
        let response = await postData({
            app,
            data,
            token: admin.token,
            url: "/sponsor/create"
        });
        assert.equal(response.status, 200);
   });
   it("should provide the sponsor ranking", async function () {
        let response = await getDatas({
            app,
            token: admin.token,
            url: "/sponsor/ranking"
        });
        assert.equal(response.body.results[0].sponsored, 6);
   })
});