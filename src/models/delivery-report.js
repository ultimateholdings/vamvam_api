/*jslint
node, this
*/
const {DataTypes} = require("sequelize");
const {conflictStatuses} = require("../utils/config");
const {formatDbPoint} = require("../utils/helpers");

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
    deliveryReport.prototype.getDeliveryDetails = async function () {
        const response = this?.toResponse() ?? {};
        let delivery = await this?.getDelivery?.() ?? {};
        delivery = delivery?.toResponse?.() ?? {};
        delivery.departure = response.lastLocation;
        delete delivery.code;
        return delivery;
    }
    return deliveryReport;
}

module.exports = defineReportModel;