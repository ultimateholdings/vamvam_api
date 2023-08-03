/*jslint
node, nomen
*/
require("dotenv").config();
const fs = require("fs");
const path = require("path");
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
const {getFileHash} = require("../src/utils/helpers");
const {
    getToken,
    otpHandler,
    registerDriver,
    setupAuthServer,
    subscriber,
    users
} = require("./fixtures/users.data");

function getFileSize(path) {
    return new Promise(function (res) {
        fs.stat(path, {bigint: true}, function (err, stat) {
            if (err) {
                res(0n);
            } else {
                res(stat.size);
            }
        });
    });
}

describe("user interactions tests", function () {
    let server;
    let app;
    let currentUser;
    const updates = {
        deviceToken: "sldjfal;kjalsdkjf aslkf;ja",
        email: "totoNg@notexisting.edu",
        firstName: "Toto Ngom",
        lastName: "Founkreo"
    };

    before(function () {
        let tmp = setupAuthServer(otpHandler);
        server = tmp.server;
        app = tmp.app;
    });
    beforeEach(async function () {
        await connection.sync({alter: true});
        currentUser = await User.create(users.goodUser);
    });

    afterEach(async function () {
        await connection.drop();
    });
    after(function () {
        server.close();
    });

    it("should provide the user infos", async function () {
        const token = await getToken(app, users.goodUser.phone);
        let response = await app.get("/user/infos");
        assert.equal(response.status, errors.notAuthorized.status);
        response = await app.get("/user/infos").set(
            "authorization",
            "Bearer " + token
        );
        assert.equal(response.status, 200);

    });

    it("should update generic user infos", async function () {
        let response;
        let token;
        response = await app.post("/user/update-profile").send(updates);
        assert.equal(response.status, errors.notAuthorized.status);
        token = await getToken(app, users.goodUser.phone);
        assert.isNotNull(token);
        response = await app.post("/user/update-profile").send(updates).set(
            "authorization",
            "Bearer " + token
        );
        assert.equal(response.status, 200);
    });

    it("should not update user role or phone or user Id", async function () {
        let response;
        let token = await getToken(app, users.goodUser.phone);
        let forbiddenUpdate = {
            id: "dlsdjflskadjweioiryqot",
            phone: "+32380",
            role: "admin"
        };
        response = await app.post("/user/update-profile").send(
            forbiddenUpdate
        ).set("authorization", "Bearer " + token);
        assert.equal(response.status, errors.invalidUploadValues.status);
        response = await User.findOne({where: {
            id: currentUser.id,
            phone: currentUser.phone,
            role: currentUser.role
        }});
        assert.isNotNull(response);
    });

    describe("file uploads handler", function () {
        const avatarPath = "test/fixtures/avatar.png";
        const carInfosPath = "test/fixtures/specs.pdf";
        let avatarHash;
        let carInfoHash;
        const files = {};
        before(async function () {
            avatarHash = await getFileHash(avatarPath);
            carInfoHash = await getFileHash(carInfosPath);
            avatarHash = "public/uploads/vamvam_" + avatarHash + ".png";
            carInfoHash = "public/uploads/vamvam_" + carInfoHash + ".pdf";
            files.avatarSize = await getFileSize(avatarPath);
            files.carInfoSize = await getFileSize(carInfosPath);
        });
        afterEach(function () {
            if (fs.existsSync(avatarHash)) {
                fs.unlink(avatarHash, console.log);
            }

            if (fs.existsSync(carInfoHash)) {
                fs.unlink(carInfoHash, console.log);
            }
        });
        it("should register a new driver", async function () {
            const driver = subscriber;
            const badDriver = Object.create(null);
            let response;
            Object.assign(badDriver, driver);
            badDriver.phoneNumber = users.firstDriver.phone;
            await User.create(users.firstDriver);
            response = await app.post("/auth/register").send(badDriver);
            assert.equal(response.status, errors.existingUser.status);
            response = await app.post("/auth/register").send(driver);
            assert.equal(response.status, errors.invalidValues.status);
            driver.carInfos = carInfosPath;
            response = await registerDriver(app, driver)
            assert.equal(response.status, 200);

        });
        it("should authenticate a driver", async function () {
            const password = "23209J@fklsd";
            const driver = subscriber;
            let response;
            driver.carInfos = carInfosPath;
            await registerDriver(app, driver);
            response = await app.post("/auth/login").send({
                password,
                phoneNumber: driver.phoneNumber
            });
            assert.deepEqual(
                response.body.message,
                errors.inactiveAccount.message
            );
            await User.update(
                {status: User.statuses.activated},
                {where: {phone: driver.phoneNumber}}    
            );
            response = await app.post("/auth/login").send({
                password,
                phoneNumber: driver.phoneNumber
            });
            assert.equal(response.status, errors.invalidCredentials.status);
            response = await app.post("/auth/login").send({
                password: driver.password,
                phoneNumber: driver.phoneNumber
            });
            assert.equal(response.status, 200);
        });
        it("should handle avatar and carInfos upload", async function () {
            const token = await getToken(app, users.goodUser.phone);
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
            response = await User.findOne(
                {where: {phone: users.goodUser.phone}}
            );
            assert.equal(response.avatar, path.normalize(avatarHash));
            assert.equal(response.carInfos, path.normalize(carInfoHash));
            files.avatarStoredSize = await getFileSize(avatarHash);
            files.carStoredSize = await getFileSize(carInfoHash);
            assert.deepEqual(
                [files.avatarSize, files.carInfoSize],
                [files.avatarStoredSize, files.carStoredSize]
            );
        });

        it("should verify user avatar deletion", async function () {
            let response;
            let token;
            token = await getToken(app, users.goodUser.phone);
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
            response = await User.findOne(
                {where: {phone: users.goodUser.phone}}
            );
            assert.isNull(response.avatar);
            assert.isFalse(fs.existsSync(avatarHash));
        });

        it(
            "should not allow to upload a file if the format is invalid",
            async function () {
                let token = await getToken(app, users.goodUser.phone);
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
                response = await User.findOne(
                    {where: {phone: users.goodUser.phone}}
                );
                assert.equal(response.avatar, currentUser.avatar);
            }
        );

    });
});