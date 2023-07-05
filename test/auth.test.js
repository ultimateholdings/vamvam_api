/*jslint
node
*/
require("dotenv").config();
const {afterEach, beforeEach, describe, it} = require("mocha");
const supertest = require("supertest");
const {assert} = require("chai");
const {User, connection} = require("../src/models");
const {buildServer} = require("../src");
const authModule = require("../src/modules/auth");
const userModule = require("../src/modules/user")
const buildAuthRoutes = require("../src/routes/auth.route");
const buildUserRoutes = require("../src/routes/user.route")
const buildRouter = require("../src/routes");
const {comparePassword} = require("../src/utils/helpers")
const phone = "+0038399873882423";
const defaultAvatar = "/path/to/avatar.jpg";


describe("authentication tests", function () {
    let otpHandler;
    let server;
    let app;

    beforeEach(async function () {
        let authRoutes;
        otpHandler = {
            sendCode: () => Promise.resolve(true),
            verifyCode: () => Promise.resolve(true)
        };
        authRoutes = buildAuthRoutes(authModule({otpHandler}));
        server = buildServer(buildRouter({authRoutes}));
        app = supertest.agent(server);
        await connection.sync({force: true});
    });

    afterEach(async function () {
        await connection.drop();
        server.close();
    });

    it("should send the OTP verification", async function () {
        const response = await app.post("/auth/send-otp").send({
            "phoneNumber": phone
        });
        assert.equal(response.status, 200);
        assert.deepEqual(response.body, {sent: true});
    });


    it("should create a new user on verified OTP", async function () {
        let response = await app.post("/auth/verify-otp").send({
            code: "1234",
            phoneNumber: phone
        });
        assert.isNotNull(response.body.token);
        assert.equal(response.status, 200);
        assert.isFalse(response.body.userExists);
        response = await app.post("/auth/verify-otp").send({
            code: "1234",
            phoneNumber: phone
        });
        assert.equal(response.status, 200);
        assert.isTrue(response.body.userExists);
        response = await User.findAll({where: {phone}});
        assert.equal(response.length, 1);

    });

    it(
        "send Token when authentication with password is correct",
        async function () {
            const password = "23209J@fklsd";
            let response;
            response = await app.post("/auth/login").send({
                password,
                phoneNumber: phone
            });
            assert.equal(response.status, 400);
            assert.equal(
                response.body.message.en,
                "phone number or password is incorrect"
            );
            await User.create({password, phone});
            response = await app.post("/auth/login").send({
                password,
                phoneNumber: phone
            });
            assert.equal(response.status, 200);
            assert.isNotNull(response.body.token);
            assert.isTrue(response.body.valid);
        }
    );

});

describe("user interactions tests", function () {
    let server;
    let app;
    let otpHandler;
    beforeEach(async function () {
        const userRoutes = buildUserRoutes(userModule({}));
        let authRoutes;
        otpHandler = {
            sendCode: () => Promise.resolve(true),
            verifyCode: () => Promise.resolve(true)
        };
        authRoutes = buildAuthRoutes(authModule({otpHandler}))
        server = buildServer(buildRouter({userRoutes, authRoutes}));
        app = supertest.agent(server);
        await connection.sync({force: true});
    });

    afterEach(async function () {
        await connection.drop();
        server.close();
    });

    it("should delete a user avatar", async function () {
        let response;
        let {token} = await app.post("/auth/verify-code").send({
            code: "1234",
            phoneNumber: phone
        });
        response = await app.post("/user/delete-avatar");
        assert.equal(response.status, 400);
        response = await app.post("/user/delete-avatar").set(
            "authorization", "Bearer " + token
        );
        assert.equal(response.status, 200);
    });
});