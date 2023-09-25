/*jslint node*/
/*jslint-disable*/
const {Op} = require("sequelize");
/*jslint-enable*/
const {User} = require("../models");
const {hashPassword} = require("../utils/helpers");
const {availableRoles} = require("../utils/config");
const guests = {};
guests[availableRoles.clientRole] = {
    phone: "+237677777777"
};
guests[availableRoles.driverRole] = {
    phone: "+237699999999"
};

async function up() {
    const password = await hashPassword("store1234567");
    await User.bulkCreate(Object.entries(guests).map(
        function ([key, value]) {
            value.role = key;
            value.password = password;
            return value;
        }
    ));
}

async function down() {
    await User.destroy({
        where: {
            phone: {
/*jslint-disable*/
                [Op.in] : Object.values(guests).map((user) => user.phone)
/*jslint-enable*/
            }
        }
    });
}

module.exports = Object.freeze({down, up});