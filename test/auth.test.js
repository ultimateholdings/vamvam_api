/*jslint
node
*/
require("dotenv").config();
const {afterEach, beforeEach, describe, it} = require("mocha");
const supertest = require("supertest");
const {User, connection} = require("../src/models");
const {buildServer} = require("../src");
const authModule = require("../src/modules/auth");
const buildAuthRoutes = require("../src/routes/auth.route");
const buildRouter = require("../src/routes");
const {assert} = require("chai");

describe("authentication tests", function () {
    const phone = "+0038399873882423";
    let otpHandler;
    let server;
    let app;

    beforeEach(async function () {
        const authRoutes = buildAuthRoutes(authModule({otpHandler}));
        server = buildServer(buildRouter({authRoutes}));
        app = supertest.agent(server);
        otpHandler = {
            sendCode: () => Promise.resolve(true),
            verifyCode: () => Promise.resolve(true)
        };
        await connection.sync({drop: true});
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
            const password = "23209jfklsd";
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