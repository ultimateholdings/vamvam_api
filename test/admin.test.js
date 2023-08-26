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
    
});