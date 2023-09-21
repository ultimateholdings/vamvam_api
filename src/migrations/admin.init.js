/*jslint node*/
const {User} = require("../models");
const {hashPassword} = require("../utils/helpers");
const {availableRoles} = require("../utils/config");
const {
    admin_name = "",
    admin_password,
    admin_email: email,
    admin_phone: phone
} = process.env;

async function up() {
    const [firstName, lastName] = admin_name.split(" ");
    const password = await hashPassword(admin_password);
    await User.create({
        email,
        firstName,
        lastName,
        password,
        phone,
        role: availableRoles.adminRole
    });
}

function down() {
    User.destroy({
        where: {email, phone}
    });
}

module.exports = Object.freeze({down, up});