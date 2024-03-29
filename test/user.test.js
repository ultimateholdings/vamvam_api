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
const {
    Sponsor,
    User,
    connection
} = require("../src/models");
const {errors} = require("../src/utils/system-messages");
const {getFileHash} = require("../src/utils/helpers");
const {
    generateToken,
    otpHandler,
    postData,
    setupServer,
    users
} = require("./fixtures/helper");

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
        lastName: "Founkreo",
        sponsorCode: "12334"
    };

    before(function () {
        let tmp = setupServer(otpHandler);
        server = tmp.server;
        app = tmp.app;
    });
    beforeEach(async function () {
        const data = {
            phone: "132129489433",
            name: "Trésor Dima",
            code: "12334"
        };
        await connection.sync({alter: true});
        currentUser = await User.create(users.goodUser);
        await Sponsor.create(data);
        currentUser.token = generateToken(currentUser);
    });

    afterEach(async function () {
        await connection.drop();
    });
    after(function () {
        server.close();
    });

    it("should provide the user infos", async function () {
        const url = "/user/infos";
        let response = await app.get(url);
        assert.equal(response.status, errors.notAuthorized.status);
        response = await app.get(url).set(
            "authorization",
            "Bearer " + currentUser.token
        );
        assert.equal(response.status, 200);

    });

    it("should allow a user to delete his account", async function () {
        let response;
        response = await postData({
            app,
            token: currentUser.token,
            url: "/user/delete-account"
        });
        response = await User.findOne({where: {id: currentUser.id}});
        assert.isNull(response);
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
        it("should handle avatar and carInfos upload", async function () {
            let response = await app.post("/user/update-profile").field(
                "firstName",
                updates.firstName
            ).field("lastName", updates.lastName).attach(
                "avatar",
                avatarPath
            ).attach(
                "carInfos",
                carInfosPath
            ).set("authorization", "Bearer " + currentUser.token);
            assert.equal(response.status, 200);
            response = await User.findOne(
                {where: {phone: currentUser.phone}}
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
            response = await app.post("/user/delete-avatar");
            assert.equal(response.status, errors.notAuthorized.status);
            response = await app.post("/user/update-profile").attach(
                "avatar",
                avatarPath
            ).set("authorization", "Bearer " + currentUser.token);
            response = await app.post("/user/delete-avatar").set(
                "authorization",
                "Bearer " + currentUser.token
            );
            assert.equal(response.status, 200);
            response = await User.findOne(
                {where: {phone: currentUser.phone}}
            );
            assert.isNull(response.avatar);
            assert.isFalse(fs.existsSync(avatarHash));
        });
    });
});