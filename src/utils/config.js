/*jslint
node
*/
"use strict";

const config = Object.freeze({
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