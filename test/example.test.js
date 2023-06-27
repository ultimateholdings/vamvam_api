import {assert} from "chai";
import {describe, it} from "mocha";

describe("example assertions just for understanding", function () {
    it("should verify adition operation", function () {
        assert.equal(1 + "3", "13");
        assert.equal(1 + 3, 4);
    });
});