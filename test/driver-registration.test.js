/*jslint
node, nomen
*/
const fs = require("node:fs");
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
    Registration,
    User,
    connection
} = require("../src/models");
const {
    clientSocketCreator,
    listenEvent,
    loginUser,
    otpHandler,
    registerDriver,
    setupDriverServer,
    subscriber,
    syncUsers,
    users
} = require("./fixtures/helper");
const getSocketManager = require("../src/utils/socket-manager");
const registrationHandler = require("../src/modules/driver.socket-handler");
const {errors} = require("../src/utils/config");
const {fileExists, getFileHash} = require("../src/utils/helpers");
const connectManager = clientSocketCreator("registration");

describe("registration tests", function () {
    const carInfosPath = "test/fixtures/specs.pdf";
    let carInfoHash;
    let app;
    let server;
    let dbUsers;
    let managerToken;
    let socketServer;
    before(async function () {
        const tmp = setupDriverServer(otpHandler);
        server = tmp.server;
        app = tmp.app;
        socketServer = getSocketManager({
            httpServer: server,
            registrationHandler: registrationHandler(Registration)
        });
        carInfoHash = await getFileHash(carInfosPath);
        carInfoHash = "public/registrations/vamvam_" + carInfoHash + ".pdf";
    });

    beforeEach(async function () {
        await connection.sync({force: true});
        dbUsers = await syncUsers(users, User);
        managerToken = await loginUser(
            app,
            dbUsers.registrationManager.phone,
            "aSimplePass"
        );
    });

    afterEach(async function () {
        let hasUpload = await fileExists(carInfoHash);
        await connection.drop();
        if (hasUpload) {
            fs.unlink(carInfoHash, console.log);
        }
    });

    after(function () {
        socketServer.close();
        server.close();
    });
    it("should register a new driver", async function () {
        const driver = subscriber;
        let response;
        await Registration.create(subscriber);
        response = await registerDriver({app, driver});
        assert.equal(response.status, errors.alreadyRegistered.status);
        driver.email = "driver@test.com";
        driver.phoneNumber = users.goodUser.phone;
        response = await registerDriver({app, driver});
        assert.equal(response.status, errors.invalidValues.status);
        driver.carInfos = carInfosPath;
        response = await registerDriver({app, driver});
        assert.equal(response.status, 200);

    });
    it("should notify the manager on new registration", async function () {
        let driver = Object.create(null);
        let response;
        let socket;
        Object.assign(driver, subscriber);
        driver.carInfos = carInfosPath;
        socket = await connectManager(managerToken);
        await registerDriver({app, driver});
        response = await listenEvent({name: "new-registration", socket});
        driver = await Registration.findOne(
            {where: {phoneNumber: driver.phoneNumber}}
        );
/*I've decided to verify only id because of an issue
with the date serialization to avoid false negative*/
        assert.equal(response.id, driver.toResponse().id);
    });
    it("should enable the manager to update the registration", async function () {
        let response;
        let registration = await Registration.create(subscriber);
        response = await app.post("/driver/update-registration").field(
            "id", "a--fake--id--of--registration"
        ).field("firstName", "test").attach("carInfos", carInfosPath).set(
            "authorization", 
            "Bearer " + managerToken
        );
        assert.equal(response.status, errors.notFound.status);
        response = await app.post("/driver/update-registration").field(
            "id", registration.id
        ).field("firstName", "test").attach("carInfos", carInfosPath).set(
            "authorization", 
            "Bearer " + managerToken
        );
        assert.equal(response.status, 200);
    });
    it(
        "should create a driver account on registration validation",
        async function () {
            let response;
            let registration = await Registration.create(subscriber);
            response = await app.post("/driver/validate-registration").send({
                id: registration.id
            }).set("authorization", "Bearer " + managerToken);
            assert.equal(response.status, 200);
            response = await loginUser(
                app,
                subscriber.phoneNumber,
                subscriber.password
            );
            assert.isNotNull(response);
            response = await app.post("/driver/reject-validation").send({
                id: registration.id
            }).set("authorization", "Bearer " + managerToken);
            assert.equal(response.status, errors.cannotPerformAction.status);
        }
    );
    it("should create an internal driver", async function () {
        const driver = Object.create(null);
        let response;
        Object.assign(driver, subscriber);
        driver.carInfos = carInfosPath;
        response = await registerDriver({
            app,
            driver,
            token: managerToken,
            url: "/driver/register-intern"
        });
        assert.equal(response.status, 200);
        response = await User.findOne({where: {id: response.body.id}});
        assert.isTrue(response.internal);
    });
});