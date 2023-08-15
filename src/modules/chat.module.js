/*jslint
node
*/
const {Delivery, Message, Room} = require("../models");
const {sendResponse} = require("../utils/helpers");
const {errors} = require("../utils/config");

function getChatModule({deliveryModel, messageModel, roomModel}) {
    const deliveriesModel = deliveryModel || Delivery;
    const messagesModel = messageModel || Message;
    const roomsModel = roomModel || Room;

    deliveriesModel.addEventListener?.("room-creation-requested", async function (data) {
        const {name, users} = data;
        await createRoom(name, users);
    });

    async function ensureRoomExists(req, res, next) {
        const {roomId} = req.body;
        const room = await roomsModel.findOne({where: {id: roomId}});
        if (room === null) {
            return sendResponse(res, errors.notFound);
        }
        req.room = room;
        next();
    }
    async function ensureUserInRoom(req, res, next) {
        const {room} = req;
        const {id} = req.user.token;
        const users = await room.getUsers();
        if (!users.some((user) => user.id === id)) {
            return sendResponse(res, errors.forbiddenAccess);
        }
        next();
    }
    async function createRoom(name, userList) {
        let result = await roomsModel.create({name});
        result.setUsers(userList);
        deliveriesModel.emitEvent?.("room-created", {
            roomId: result.id,
            users: userList.map((user) => user.id)
        });
    }
    async function sendMessage(req, res) {
        const {id} = req.user.token;
        const {room} = req;
        const {content} = req.body;
        let message;

        if (typeof content === "string" && content.length > 0) {
            message = await messagesModel.create({
                content,
                senderId: id,
                roomId: room.id
            });
            return res.status(200).send({id: message.id});
        }
        sendResponse(res, errors.invalidValues);
    }

    async function getRoomMessages(req, res) {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 8;
        const offset = (page - 1) * limit;
        const {roomId} = req.body;
        //TODO: implement token-based pagination
        let response = await messagesModel.getAllByRoom({
          limit,
          offset,
          roomId
        });
        res.status(200).json({
            succes: true,
            totalmessage: response.count,
            totalPage: Math.ceil(response.count / limit),
            messages: response.rows
        });
    }

    return Object.freeze({
        ensureRoomExists,
        ensureUserInRoom,
        getRoomMessages,
        sendMessage
    });
}

module.exports = getChatModule;