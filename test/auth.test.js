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
const {User, connection} = require("../src/models");
const {buildServer} = require("../src");
const authModule = require("../src/modules/auth.module");
const userModule = require("../src/modules/user.module");
const buildAuthRoutes = require("../src/routes/auth.route");
const buildUserRoutes = require("../src/routes/user.route");
const buildRouter = require("../src/routes");
const {comparePassword, getFileHash} = require("../src/utils/helpers");
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
    let updates;
    let currentUser;
    const userDatas = {
        avatar: defaultAvatar,
        firstName: "Tankoua",
        lastName: "Jean-christophe",
        phone,
        role: "client"
    };

    async function getToken(app) {
        const credentials = {
            code: "1234",
            phoneNumber: phone
        };
        const response = await app.post("/auth/verify-otp").send(credentials);
        return response.body.token;
    }
    beforeEach(async function () {
        const userRoutes = buildUserRoutes(userModule({}));
        let authRoutes;
        otpHandler = {
            sendCode: () => Promise.resolve(true),
            verifyCode: () => Promise.resolve(true)
        };
        updates = {
            deviceToken: "sldjfal;kjalsdkjf aslkf;ja",
            email: "totoNg@notexisting.edu",
            firstName: "Toto Ngom",
            lastName: "Founkreo",
            password: "@sdjUlT2340!**&&&&&&&&"
        };
        authRoutes = buildAuthRoutes(authModule({otpHandler}));
        server = buildServer(buildRouter({authRoutes, userRoutes}));
        app = supertest.agent(server);
        await connection.sync({alter: true});
        currentUser = await User.create(userDatas);
    });

    afterEach(async function () {
        await connection.drop();
        server.close();
    });

    it("should provide the user infos", async function () {
        const token = await getToken(app);
        let response = await app.get("/user/infos");
        assert.equal(response.status, 401);
        response = await app.get("/user/infos").set(
            "authorization",
            "Bearer " + token
        );
        assert.equal(response.status, 200);
        assert.isTrue(Object.entries(userDatas).every(
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
        assert.equal(response.status, 401);
        token = await getToken(app);
        assert.isNotNull(token);
        response = await app.post("/user/update-profile").send(updates).set(
            "authorization",
            "Bearer " + token
        );
        assert.equal(response.status, 200);
        response = await User.findOne({where: {phone}});
        assert.equal(response.firstName, updates.firstName);
        assert.equal(response.email, updates.email);
        assert.equal(response.lastName, updates.lastName);
        assert.equal(response.deviceToken, updates.deviceToken);
        assert.notEqual(updates.password, response.password);
        response = await comparePassword(updates.password, response.password);
        assert.isTrue(response);
    });

    it("should not update user role or phone or userId", async function () {
        let response;
        let token = await getToken(app);
        let forbiddenUpdate = {
            phone: "+32380",
            role: "admin",
            userId: "dlsdjflskadjweioiryqot"
        };
        response = await app.post("/user/update-profile").send(
            forbiddenUpdate
        ).set("authorization", "Bearer " + token);
        assert.equal(response.status, 400);
        assert.equal(
            response.body.message,
            "cannot update with invalid values"
        );
        response = await User.findOne({where: {
            phone: currentUser.phone,
            role: currentUser.role,
            userId: currentUser.userId
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
            const token = await getToken(app);
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
            response = await User.findOne({where: {phone}});
            assert.equal(response.avatar, path.normalize(avatarHash));
            assert.equal(response.carInfos, path.normalize(carInfoHash));
            assert.isTrue(fs.existsSync(avatarHash));
            assert.isTrue(fs.existsSync(carInfoHash));
        });

        it("should verify user avatar deletion", async function () {
            let response;
            let token;
            token = await getToken(app);
            response = await app.post("/user/delete-avatar");
            assert.equal(response.status, 401);
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
            response = await User.findOne({where: {phone}});
            assert.isNull(response.avatar);
            assert.isFalse(fs.existsSync(avatarHash));
        });

        it(
            "should not allow to upload a file if the format is invalid",
            async function () {
                let token = await getToken(app);
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
                response = await User.findOne({where: {phone}});
                assert.equal(response.avatar, currentUser.avatar);
                debugger;
                assert.isFalse(fs.existsSync(carInfoHash));
                assert.isFalse(fs.existsSync(avatarHash));
            }
        );

    });
});