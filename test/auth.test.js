/*jslint
node, nomen
*/
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {
    afterEach,
    before,
    beforeEach,
    describe,
    it
} = require("mocha");
const supertest = require("supertest");
const {assert} = require("chai");
const {otpRequest, User, connection} = require("../src/models");
const {buildServer} = require("../src");
const authModule = require("../src/modules/auth.module");
const userModule = require("../src/modules/user.module");
const buildAuthRoutes = require("../src/routes/auth.route");
const buildUserRoutes = require("../src/routes/user.route");
const buildRouter = require("../src/routes");
const {comparePassword, getFileHash} = require("../src/utils/helpers");
const {errors} = require("../src/utils/config");
const getSocketManager = require("../src/utils/socket-manager");
const {
    clientSocketCreator,
    pinIds,
    getToken,
    setupInterceptor,
    users: {badUser, goodUser, firstDriver: secondUser}
} = require("./fixtures/users.data");

const otpHandlerFake = {
    sendCode: () => Promise.resolve({verified: true}),
    verifyCode: () => Promise.resolve({verified: true})
};

describe("authentication tests", function () {
    let server;
    let app;
    const signature = "1234567890";
    before(function () {
        let authRoutes = buildAuthRoutes(authModule({}));
        server = buildServer(buildRouter({authRoutes}));
        app = supertest.agent(server);
        setupInterceptor();
    });
    
    beforeEach(async function () {
        await connection.sync({force: true});
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
                phoneNumber: badUser.phone,
                signature
            });
            assert.equal(response.status, errors.internalError.status);
        }
    );
    it("should send the OTP verification", async function () {
        let response = await app.post("/auth/send-otp").send({
            phoneNumber: goodUser.phone,
            signature
        });
        assert.equal(response.status, 200);
        response = await app.post("/auth/send-otp").send({
            phoneNumber: secondUser.phone,
            signature
        });
        assert.equal(response.status, 200);
        response = await otpRequest.findAll();
        assert.deepEqual(response.length, 2);
    });

    it("should not verify a code if it the OTP wasn't sent", async function () {
        let response = await app.post("/auth/verify-otp").send({
            code: "123456",
            phoneNumber: badUser.phone
        });
        assert.equal(response.status, errors.requestOTP.status);
    });
    it("should create a new user on verified OTP", async function () {
        let response;
        await otpRequest.bulkCreate([
            {phone: secondUser.phone, pinId: pinIds[0]},
            {phone: goodUser.phone, pinId: pinIds[1]}
        ]);
        response = await app.post("/auth/verify-otp").send({
            code: "1234",
            phoneNumber: secondUser.phone,
        });
        assert.equal(response.status, errors.notAuthorized.status);
        response = await app.post("/auth/verify-otp").send({
            code: "1234",
            phoneNumber: goodUser.phone,
            role: "admin"
        });
        assert.equal(response.status, errors.notAuthorized.status);
        response = await app.post("/auth/verify-otp").send({
            code: "1234",
            phoneNumber: goodUser.phone,
            role: "driver"
        });
        assert.equal(response.status, 200);
        assert.isFalse(response.body.userExists);
        await app.post("/auth/send-otp").send({
            phoneNumber: goodUser.phone,
            signature
        });
        response = await app.post("/auth/verify-otp").send({
            code: "1234",
            phoneNumber: goodUser.phone
        });
        assert.equal(response.status, 200);
        assert.isTrue(response.body.userExists);
        response = await User.findAll({where: {phone: goodUser.phone}});
        assert.equal(response.length, 1);
        response = await otpRequest.findOne({where: {phone: goodUser.phone}});
        assert.isNull(response);
    });

    it(
        "send Token when authentication with password is correct",
        async function () {
            const password = "23209J@fklsd";
            let response;
            response = await app.post("/auth/login").send({
                password,
                phoneNumber: secondUser.phone
            });
            assert.equal(response.status, errors.invalidValues.status);
            assert.deepEqual(
                response.body.message,
                errors.invalidCredentials.message
            );
            await User.create({password, phone: secondUser.phone});
            response = await app.post("/auth/login").send({
                password,
                phoneNumber: secondUser.phone
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
    let updates;
    let currentUser;


    before(function () {
        const userRoutes = buildUserRoutes(userModule({}));
        let authRoutes;
        updates = {
            deviceToken: "sldjfal;kjalsdkjf aslkf;ja",
            email: "totoNg@notexisting.edu",
            firstName: "Toto Ngom",
            lastName: "Founkreo",
            password: "@sdjUlT2340!**&&&&&&&&"
        };
        authRoutes = buildAuthRoutes(authModule({otpHandler: otpHandlerFake}));
        server = buildServer(buildRouter({authRoutes, userRoutes}));
        app = supertest.agent(server);

    });
    beforeEach(async function () {
        await connection.sync({alter: true});
        currentUser = await User.create(goodUser);
    });

    afterEach(async function () {
        await connection.drop();
    });
    after(function () {
        server.close();
    });

    it("should provide the user infos", async function () {
        const token = await getToken(app, goodUser.phone);
        let response = await app.get("/user/infos");
        assert.equal(response.status, errors.notAuthorized.status);
        response = await app.get("/user/infos").set(
            "authorization",
            "Bearer " + token
        );
        assert.equal(response.status, 200);
        assert.isTrue(Object.entries(goodUser).every(
            function ([key, value]) {
                if (key === "phone") {
                    return response.body["phoneNumber"] === value;
                } else {
                    return response.body[key] === value;
                }
            }
        ));

    });

    it("should update generic user infos", async function () {
        let response;
        let token;
        response = await app.post("/user/update-profile").send(updates);
        assert.equal(response.status, errors.notAuthorized.status);
        token = await getToken(app, goodUser.phone);
        assert.isNotNull(token);
        response = await app.post("/user/update-profile").send(updates).set(
            "authorization",
            "Bearer " + token
        );
        assert.equal(response.status, 200);
        response = await User.findOne({where: {phone: goodUser.phone}});
        assert.isTrue(Object.entries(updates).every(function ([key, value]) {
            if (key === "password") {
                return value !== response[key];
            }
            return value === response[key];
        }));
        response = await comparePassword(updates.password, response.password);
        assert.isTrue(response);
    });

    it("should not update user role or phone or user Id", async function () {
        let response;
        let token = await getToken(app, goodUser.phone);
        let forbiddenUpdate = {
            phone: "+32380",
            role: "admin",
            id: "dlsdjflskadjweioiryqot"
        };
        response = await app.post("/user/update-profile").send(
            forbiddenUpdate
        ).set("authorization", "Bearer " + token);
        assert.equal(response.status, errors.invalidValues.status);
        assert.equal(
            response.body.message,
            "cannot update with invalid values"
        );
        response = await User.findOne({where: {
            phone: currentUser.phone,
            role: currentUser.role,
            id: currentUser.id
        }});
        assert.isNotNull(response);
    });

    describe("file uploads handler", function () {
        const avatarPath = "test/fixtures/avatar.png";
        const carInfosPath = "test/fixtures/specs.pdf";
        let avatarHash;
        let carInfoHash;
        before(async function () {
            avatarHash = await getFileHash(avatarPath);
            carInfoHash = await getFileHash(carInfosPath);
            avatarHash = "public/uploads/vamvam_" + avatarHash + ".png";
            carInfoHash = "public/uploads/vamvam_" + carInfoHash + ".pdf";
        });
        afterEach(function () {
            if (fs.existsSync(avatarHash)) {
                fs.unlink(avatarHash, console.log);
            }

            if (fs.existsSync(carInfoHash)) {
                fs.unlink(carInfoHash, console.log);
            }
        });
        it("should handle avatar and carInfos upload", async function () {
            const token = await getToken(app, goodUser.phone);
            let response = await app.post("/user/update-profile").field(
                "firstName",
                updates.firstName
            ).field("lastName", updates.lastName).attach(
                "avatar",
                avatarPath
            ).attach(
                "carInfos",
                carInfosPath
            ).set("authorization", "Bearer " + token);
            assert.equal(response.status, 200);
            response = await User.findOne({where: {phone: goodUser.phone}});
            assert.equal(response.avatar, path.normalize(avatarHash));
            assert.equal(response.carInfos, path.normalize(carInfoHash));
            assert.isTrue(fs.existsSync(avatarHash));
            assert.isTrue(fs.existsSync(carInfoHash));
        });

        it("should verify user avatar deletion", async function () {
            let response;
            let token;
            token = await getToken(app, goodUser.phone);
            response = await app.post("/user/delete-avatar");
            assert.equal(response.status, errors.notAuthorized.status);
            response = await app.post("/user/update-profile").attach(
                "avatar",
                avatarPath
            ).set(
                "authorization",
                "Bearer " + token
            );
            response = await app.post("/user/delete-avatar").set(
                "authorization",
                "Bearer " + token
            );
            assert.equal(response.status, 200);
            response = await User.findOne({where: {phone: goodUser.phone}});
            assert.isNull(response.avatar);
            assert.isFalse(fs.existsSync(avatarHash));
        });

        it(
            "should not allow to upload a file if the format is invalid",
            async function () {
                let token = await getToken(app, goodUser.phone);
                let response = await app.post("/user/update-profile").field(
                    "firstName",
                    "Vamvam soft"
                ).attach(
                    "avatar",
                    carInfosPath
                ).attach(
                    "carInfos",
                    avatarPath
                ).set(
                    "authorization",
                    "Bearer " + token
                );
                assert.equal(response.status, 200);
                response = await User.findOne({where: {phone: goodUser.phone}});
                assert.equal(response.avatar, currentUser.avatar);
                assert.isFalse(fs.existsSync(carInfoHash));
                assert.isFalse(fs.existsSync(avatarHash));
            }
        );

    });
});
describe("socket authentication", function () {
    let server;
    let socketServer;
    let app;
    let currentUser;
    let socketGenerator = clientSocketCreator("delivery");
    before(async function () {
        let authRoutes = buildAuthRoutes(authModule({
            otpHandler: otpHandlerFake
        }));
        server = buildServer(buildRouter({authRoutes}));
        app = supertest.agent(server);
        socketServer = getSocketManager({httpServer: server});
    });
    beforeEach(async function () {
        let userToken
        await connection.sync({alter: true});
        currentUser = await User.create(goodUser);
        userToken = await getToken(app, goodUser.phone);
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
        let client;
        try {
            client = await socketGenerator();
        } catch (error) {
            assert.deepEqual(error.data, errors.notAuthorized.message);
        }
    });
    it("should allow the user when having token", function (done){
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