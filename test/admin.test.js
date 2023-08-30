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
const {User, connection} = require("../src/models");
const {errors} = require("../src/utils/config");
const {
    generateToken,
    otpHandler,
    postData,
    setupServer,
    users,
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
        .set("page_token", response.body.nextPageToken);
        assert.deepEqual(response.body.results.length, 3)
    })
});