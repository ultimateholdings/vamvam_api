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
const {User, connection, otpRequest} = require("../src/models");
const {availableRoles, errors} = require("../src/utils/config");
const getSocketManager = require("../src/utils/socket-manager");
const {
    clientSocketCreator,
    getToken,
    otpHandler,
    pinIds,
    setupAuthServer,
    setupInterceptor,
    subscriber,
    users
} = require("./fixtures/users.data");

describe("authentication tests", function () {
    let server;
    let app;
    let driver;
    const signature = "1234567890";
    before(function () {
        driver = subscriber;
        let tmp = setupAuthServer();
        server = tmp.server;
        app = tmp.app;
        driver.phone = users.goodUser.phone;
        driver.role = availableRoles.driverRole;
        setupInterceptor();
    });

    beforeEach(async function () {
        await connection.sync({force: true});
        await otpRequest.bulkCreate([
            {phone: users.firstDriver.phone, pinId: pinIds[0]},
            {phone: users.goodUser.phone, pinId: pinIds[1]}
        ]);
    });

    afterEach(async function () {
        await connection.drop();
    });

    after(function () {
        server.close();
    });

    it(
        "should respond 501 status if the OTP provider throws",
        async function () {
            let response;
            response = await app.post("/auth/send-otp").send({
                phoneNumber: users.badUser.phone,
                signature
            });
            assert.equal(response.status, errors.internalError.status);
        }
    );

    it("should not verify a code if it the OTP wasn't sent", async function () {
        let response = await app.post("/auth/verify-otp").send({
            code: "123456",
            phoneNumber: users.badUser.phone
        });
        assert.equal(response.status, errors.requestOTP.status);
    });
    it("should create a new user on verified OTP", async function () {
        let response;
        response = await app.post("/auth/verify-otp").send({
            code: "1234",
            phoneNumber: users.firstDriver.phone
        });
        assert.equal(response.status, errors.notAuthorized.status);
        response = await app.post("/auth/verify-otp").send({
            code: "1234",
            phoneNumber: users.goodUser.phone,
            role: "driver"
        });
        assert.equal(response.status, 200);
        assert.isFalse(response.body.userExists);
        await app.post("/auth/send-otp").send({
            phoneNumber: users.goodUser.phone,
            signature
        });
        response = await app.post("/auth/verify-otp").send({
            code: "1234",
            phoneNumber: users.goodUser.phone
        });
        assert.equal(response.status, 200);
        assert.isTrue(response.body.userExists);
        response = await User.findAll({where: {phone: users.goodUser.phone}});
        assert.equal(response.length, 1);
        response = await otpRequest.findOne(
            {where: {phone: users.goodUser.phone}}
        );
        assert.isNull(response);
    });

    it("should allow a user to reset password", async function () {
        const newPassword = "12345934934";
        let response;
        let resetToken;
        response = {status: User.statuses.activated};
        Object.assign(response, driver);
        await User.create(response);
        await app.post("/auth/send-otp").send({
            phoneNumber: driver.phone
        });
        response = await app.post("/auth/verify-reset").send({
            code: "1234",
            phoneNumber: driver.phone
        });
        resetToken = response.body.resetToken;
        assert.equal(response.status, 200);
        response = await app.post("/auth/reset-password").send({
            key: "afaketokenwchich-will-fail",
            password: newPassword
        });
        assert.equal(response.status, errors.tokenInvalid.status);
        response = await app.post("/auth/reset-password").send({
            key: resetToken,
            password: newPassword
        });
        assert.equal(response.status, 200);
    });

    it("should allow a user to change password", async function () {
        const newPassword = "a dummy pass 1000";
        let token;
        let response;
        response = {status: User.statuses.activated};
        Object.assign(response, driver);
        await User.create(response);
        response = await app.post("/auth/login").send({
            password: driver.password,
            phoneNumber: driver.phone
        });
        assert.equal(response.status, 200);
        token = response.body.token;
        response = await app.post("/auth/change-password").send({
            newPassword,
            oldPassword: "a wrong password"
        }).set("authorization", "Bearer " + token);
        assert.equal(response.status, errors.invalidCredentials.status);
        response = await app.post("/auth/change-password").send({
            newPassword,
            oldPassword: driver.password
        }).set("authorization", "Bearer " + token);
        assert.equal(response.status, 200);
    });
});
describe("socket authentication", function () {
    let server;
    let socketServer;
    let app;
    let currentUser;
    let socketGenerator = clientSocketCreator("delivery");
    before(function () {
        const tmp = setupAuthServer(otpHandler);
        server = tmp.server;
        app = tmp.app;
        socketServer = getSocketManager({httpServer: server});
    });
    beforeEach(async function () {
        let userToken;
        await connection.sync({alter: true});
        currentUser = await User.create(users.goodUser);
        userToken = await getToken(app, users.goodUser.phone);
        currentUser.token = userToken;
    });
    afterEach(async function () {
        await connection.drop();
    });
    after(function () {
        socketServer.io.close();
        server.close();
    });
    it("should reject if a user is not authenticated", async function () {
        try {
            await socketGenerator();
        } catch (error) {
            assert.deepEqual(error.data, errors.notAuthorized.message);
        }
    });
    it("should allow the user when having token", function (done) {
        socketGenerator(currentUser.token).then(function (client) {
            client.on("new-delivery", function (data) {
                assert.deepEqual(data, {price: 1000});
                done();
                client.close();
            });
            socketServer.forwardMessage(
                currentUser.id,
                "new-delivery",
                {price: 1000}
            );

        });
    });
});