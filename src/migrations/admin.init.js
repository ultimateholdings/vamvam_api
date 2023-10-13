/*jslint node*/
const {User} = require("../models");
const {availableRoles} = require("../utils/config");
const {
    admin_name = "",
    admin_password: password,
    admin_email: email,
    admin_phone: phone
} = process.env;

async function up() {
    const [firstName, lastName] = admin_name.split(" ");
    await User.create({
        email,
        firstName,
        lastName,
        password,
        phone,
        role: availableRoles.adminRole
    });
}

async function down() {
    await User.destroy({
        where: {email, phone}
    });
}

module.exports = Object.freeze({down, up});