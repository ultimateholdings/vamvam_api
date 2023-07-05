const { Sequelize } = require('sequelize');

const database = new Sequelize('vamvam_api', 'root', '', {
    host: 'localhost',
    dialect:'mysql'
  });

module.exports = database;
