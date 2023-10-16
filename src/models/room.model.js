/*jslint
node, this
*/
const {DataTypes, Op, col, fn, literal, where} = require("sequelize");
const {buildClause, constraints, join, paginationQuery} = require("./helper");
const types = require("../utils/db-connector");
const {propertiesPicker} = require("../utils/helpers");

const roomSchema = {
    id: types.uuidType(),
    name: types.required(DataTypes.STRING)
};
const messageSchema = {
    content: DataTypes.STRING,
    id: types.uuidType(),
    reader: DataTypes.JSON
};
const order = [["createdAt", "DESC"]];
function defineRoomModel(connection, userModel, deliveryModel) {
    const message = connection.define("Message", messageSchema);
    const room = connection.define("room", roomSchema);
    const userJoin = connection.define(
        "Room_User",
        {id: types.uuidType()},
        {timestamps: false}
    );

    room.belongsToMany(userModel, {through: userJoin});
    userModel.belongsToMany(room, {through: userJoin});
    room.hasMany(message, constraints("roomId").with({onDelete: "CASCADE"}));
    message.belongsTo(room, constraints("roomId"));
    message.belongsTo(userModel, constraints("senderId", "sender"));
    room.belongsTo(deliveryModel, constraints("deliveryId"));
    room.prototype.toResponse = function () {
        let result;
        const datas = this.dataValues;
        result = propertiesPicker(datas)(Object.keys(roomSchema));
        if (typeof datas.createdAt?.toISOString === "function") {
            result.createdAt = datas.createdAt.toISOString();
        }
        
        if (deliveryModel.prototype.isPrototypeOf(datas.delivery)) {
            result.delivery = datas.delivery.toShortResponse();
        }
        return result;
    };
    message.prototype.toResponse = function () {
        let result;
        const datas = this.dataValues;
        result = propertiesPicker(datas)(Object.keys(messageSchema));
        result.date = datas.createdAt.toISOString();
        if (userModel.prototype.isPrototypeOf(datas.sender)) {
            result.sender = datas.sender.toShortResponse();
        }
        if (room.prototype.isPrototypeOf(datas.room)) {
            result.room = datas.room.toResponse();
        }
        return result;
    }
    
    message.markAsRead = function (userId, messagesId) {
        return this.update(
            {
                reader: fn(
                    "JSON_ARRAY_INSERT",
                    fn(
                        "IF",
                        literal("`reader` IS NULL"),
                        fn("JSON_ARRAY"),
                        col("reader")
                    ),
                    "$[0]",
                    userId
                )
            },
            {where: {id: buildClause(Op.in, messagesId)}}
        );
    };
    
    room.getUserRooms = async function (userId) {
        const include = join(room).with({
            include: [
                join(message).with({
                    include: join(userModel, "sender", false),
                    limit: 1,
                    order
                }),
                join(userModel),
                join(deliveryModel)
            ]
        });
        let result = await userModel.findOne({
            include,
            where: {id: userId}
        });
        if (result === null) {
            return [];
        }
        return result.rooms.map(function (room) {
            const result = room.toResponse();
            const messages = room.Messages.map(function (msg) {
                const result = msg.toResponse();
                result.room = room.toResponse();
                return result;
            });
            result.members = room.users.map((user) => user.toShortResponse());
            result.lastMessage = messages[0];
            return result;
        });
    };

    message.getMissedMessages = async function (id) {
        let clause = [
            where(
                fn("JSON_SEARCH", col("reader"), "one", id),
                buildClause(Op.is, null)
            ),
            {senderId: buildClause(Op.ne, id)}
        ];
        let result = await message.findAll({
            include: [
                join(room).with({
                    attributes: ["id", "name"],
                    include: join(userModel).with({where: {id}})
                }),
                join(userModel, "sender")
            ],
            where: buildClause(Op.and, clause)
        });
        result = result.reduce(function (acc, row) {
            const {room} = row;
            if (acc[room.id] === undefined) {
                acc[room.id] = {
                    count: 0,
                    messages: [],
                    roomName: room.name
                };
            }
            acc[room.id].count += 1;
            acc[room.id].messages.push(row.toResponse());
            return acc;
        }, Object.create(null));
        return result;
    };
    message.getAllByRoom = async function ({maxSize, offset, roomId}) {
        let query = paginationQuery(offset ?? 0, maxSize);
        let formerLastId;
        let results;
        query.include = [join(userModel, "sender"), join(room)];
        query.order = order;
        if (typeof roomId === "string") {
            query.where = {roomId};
        }
        results = await message.findAndCountAll(query);
        if ((offset ?? 0) > 0) {
            formerLastId = results.rows.shift();
            formerLastId = formerLastId?.id;
        }
        return {
            formerLastId,
            lastId: results.rows.at(-1)?.id,
            values: results.rows.map((row) => row.toResponse())
        };
    };
    return {message, room, userJoin};
}

module.exports = defineRoomModel;
