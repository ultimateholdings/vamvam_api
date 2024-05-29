const {DataTypes} = require("sequelize");
const {col, fn, literal} = require("sequelize");

function defineTransaction (connection) {
    const schema = {
        type: {
            type: DataTypes.ENUM,
            defaultValue: "recharge",
            values: ["recharge", "withdrawal"]
        },
        point: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        bonus: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        unitPrice: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        id: {
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            type: DataTypes.UUID
        }
    };
    const transaction = connection.define("transaction", schema );
    transaction.getAllByType= async function ({limit, offset, id, type}) {
        const result = await transaction.findAndCountAll({
            limit,
            offset,
            order: [["createdAt", "DESC"]],
            where: {
                driverId: id,
                type: type
            },
        });
        result.rows = result.rows.map(function (row) {
            const {
                bonus,
                createdAt: date,
                point,
                unitPrice
            } = row;
            return Object.freeze({
                amount: point * unitPrice,
                bonus,
                date,
                point
            });
        });
        return result;
    };
    return transaction;
}

module.exports = defineTransaction;
