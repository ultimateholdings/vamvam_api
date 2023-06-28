import {assert} from "chai";
import {describe, it} from "mocha";
import tokenManager from "../src/utils/token_manager.js";
import otpManager from "../src/utils/otp_manager.js";

describe("utilities feature tests", function () {
    const token_manager = tokenManager();
    
    function codeSender () {}
    function dbServiceMock () {
        let db = {};
        return {
            getCode (number) {
                return Promise.resolve(db[number]);
            },
            saveCode(number, code) {
                return new Promise(function executor (res) {
                    db[number] = code;
                    res();
                });
            }
        };
    }

    it("should validate a generated token", async function tokenCheck () {
        let token;
        let result;
        let payload = Object.create(null);
        payload.user = "test";
        payload.pass = "leroserfd";
        payload = Object.freeze(payload);
        token = token_manager.generate(payload);
        ({token: result} = await token_manager.validate(token));
        assert.equal(result.pass, payload.pass);
        assert.equal(result.user, payload.user);
    });

    it("should verify a sent code", async function otpCheck () {
        let result;
        let code;
        const number = "343404843259852";
        const dbService = dbServiceMock()
        const otp_manager = otpManager(codeSender, dbService);
        await otp_manager.sendCode(number);
        code = await dbService.getCode(number);
        result = await otp_manager.verifyCode(number, code);
        assert.isTrue(result);
    });
});
