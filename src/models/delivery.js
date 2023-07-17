/*jslint
node
*/
const {DataTypes} = require("sequelize");

function defineDeliveryModel(connection) {
    const delivery = connection.define("delivery", {
        begin: DataTypes.DATE,
        code: DataTypes.STRING,
        deliveryMeta: DataTypes.JSON,
        departure: {
            allowNull: false,
            type: new DataTypes.GEOMETRY("POINT")
        },
        destination: {
            allowNull: false,
            type: new DataTypes.GEOMETRY("POINT")
        },
        end: DataTypes.DATE,
        id: {
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            type: DataTypes.UUID
        },
        price: DataTypes.DOUBLE,
        recipientInfos: {
            allowNull: false,
            type: DataTypes.JSON
        },
        status: {
            defaultValue: "pending",
            type: DataTypes.ENUM,
            values: ["pending", "cancelled", "started", "terminated"]
        }
    });
    return delivery;
}

module.exports = defineDeliveryModel;