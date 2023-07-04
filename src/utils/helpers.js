const bcrypt = require("bcrypt");

function methodAdder (object) {
    return function addMethod(name, func) {
        if (typeof object === "object" && !object.hasOwnProperty(name)) {
            object.prototype[name] = func;
        }
    }
}

function propertiesPicker (object) {
    return function (...props) {
        if (typeof object === "object") {
            return Object.entries(object).reduce(function (acc, entry) {
                let [key, value] = entry;
                if (props.includes(key) && value != null) {
                    acc[key] = value;
                }
                return acc;
            }, {});
        }
        return {};
    }
}

function getOTPService () {
    async function sendOTP(phoneNumber) {
        return Promise.resolve(true)
    }

    async function verifyOTP(phoneNumber, code) {
        return Promise.resolve(true);
    }

    return Object.freeze({sendOTP, verifyOTP});
}


module.exports = Object.freeze({
    comparePassword(givenPassword, hash) {
        return new Promise(function executor(resolve, reject) {
            bcrypt.compare(givenPassword, hash, function (err, result) {
                if (err != null) {
                    reject(err);
                }
                resolve(result === true);
            });
        });
    },
    getOTPService,
    hashPassword(password) {
        return new Promise(function executor(resolve, reject) {
            bcrypt.hash(password, 10, function (err, result) {
                if (err != null) {
                    reject(err);
                }
                resolve(result);
            });
        });
    },
    methodAdder,
    propertiesPicker
});