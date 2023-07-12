/*jslint
node
*/
"use strict";

const config = Object.freeze({
    getOTPConfig() {
        const {
            otp_key,
            otp_send,
            otp_verify
        } = process.env;
        return Object.freeze({
            getSendingBody: function (receiver, signature) {
                return {
                    api_key: otp_key,
                    channel: "generic",
                    from: "VAMVAM",
                    message_text: "<#> Your verification code is" +
                    " @vamvam@ \n\n" + signature,
                    pin_attempts: 3,
                    pin_length: 6,
                    pin_placeholder: "@vamvam@",
                    pin_time_to_live: 3,
                    text_type: "ALPHANUMERIC",
                    to: receiver
                };
            },
            getVerificationBody: function (pin_id, pin) {
                return {
                    api_key: otp_key,
                    pin_id,
                    pin
                };
            },
            sent_url: otp_send,
            verify_url: otp_verify
        });
    },
    getdbConfig() {
        const {
            NODE_ENV: env = "test",
            DB_PASSWORD: password = null,
            db_port: port,
            production_db,
            test_db,
            DB_USER: username = "root"
        } = process.env;
        const configs = {
            production: {
                database: production_db,
                password,
                port,
                username
            },
            test: {
                database: test_db,
                password,
                port,
                username
            }
        };
        return configs[env];
    }
});

module.exports = config;