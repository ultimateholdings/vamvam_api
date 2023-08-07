/*jslint
node, this
*/
const {DataTypes} = require("sequelize");

function defineReportModel(connection) {
    const schema = {
        date: {
            defaultValue: new Date(),
            type: DataTypes.DATE
        },
        lastLocation: {
            allowNull: false,
            type: new DataTypes.GEOMETRY("POINT")
        },
        type: {
            allowNull: false,
            type: DataTypes.STRING
        },
    };
    const deliveryReport = connection.define("delivery_conflict", schema);
    deliveryReport.prototype.toResponse = function () {
        const result = this.dataValues;
        
        if (result.lastLocation !== null && result.lastLocation !== undefined) {
            result.lastLocation = {
                latitude: result.lastLocation.coordinates[0],
                longitude: result.lastLocation.coordinates[1]
            };
        }
        return result;
    };
    return deliveryReport;
}

module.exports = defineReportModel;