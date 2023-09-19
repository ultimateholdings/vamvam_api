/*jslint
node, this
*/
const {DataTypes} = require("sequelize");
const {conflictStatuses} = require("../utils/config");
const {formatDbPoint} = require("../utils/helpers");

function defineReportModel(connection) {
    const schema = {
        cancellationDate: DataTypes.DATE,
        date: {
            defaultValue: new Date(),
            type: DataTypes.DATE
        },
        id: {
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            type: DataTypes.UUID
        },
        lastLocation: {
            allowNull: false,
            type: new DataTypes.GEOMETRY("POINT")
        },
        lastLocationAddress: DataTypes.STRING,
        status: {
            allowNull: false,
            defaultValue: conflictStatuses.opened,
            type: DataTypes.ENUM,
            values: Object.values(conflictStatuses)
        },
        type: {
            allowNull: false,
            type: DataTypes.STRING
        }
    };
    const deliveryReport = connection.define("delivery_conflict", schema);
    deliveryReport.prototype.toResponse = function () {
        const result = this.dataValues ?? {};
        result.lastLocation = formatDbPoint(result.lastLocation);
        return result;
    };
    return deliveryReport;
}

module.exports = defineReportModel;