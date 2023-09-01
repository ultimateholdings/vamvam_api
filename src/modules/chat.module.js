/*jslint
node
*/
const {Delivery, Message, Room} = require("../models");
const {ressourcePaginator, sendResponse} = require("../utils/helpers");
const {errors} = require("../utils/config");

function getChatModule({deliveryModel, messageModel, roomModel}) {
    const deliveriesModel = deliveryModel || Delivery;
    const messagesModel = messageModel || Message;
    const roomsModel = roomModel || Room;
    const messagePagination = ressourcePaginator(messagesModel.getAllByRoom);
    
    deliveriesModel.addEventListener("room-creation-requested", createRoom);

    deliveriesModel.addEventListener(
        "missed-messages-requested",
        async function ({userId}) {
            let missedRooms = await messagesModel.getMissedMessages(userId);
            Object.entries(missedRooms).forEach(function ([roomId, datas]) {
                datas.roomId = roomId;
                datas.userId = userId;
                deliveriesModel.emitEvent("missed-messages-from-room", datas);
            });
        }
    );
    deliveriesModel.addEventListener(
        "messages-read-request",
        async function (data) {
            const {messagesId = [], userId} = data;
            let [updated] = await messagesModel.markAsRead(userId, messagesId);
            deliveriesModel.emitEvent(
                "messages-read-fulfill",
                {updated, userId}
            );
        }
    );
    deliveriesModel.addEventListener("delivery-end", async function (data) {
        const {deliveryId} = data;
        const room = await roomsModel.findOne({where: {deliveryId}});
        let roomUsers;
        if (room !== null) {
            roomUsers = await room.getUsers();
            await roomsModel.destroy({
                individualHooks: true,
                where: {id: room.id}
            });
            deliveriesModel.emitEvent("room-deleted", {
                id: room.id,
                name: room.name,
                users: roomUsers.map((user) => user.id)
            });
        }
    });
    
    async function createRoom(data) {
        const {delivery, name, users} = data;
        let room = await roomsModel.create({name});
        await room.setUsers(users);
        await room.setDelivery(delivery);
        deliveriesModel.emitEvent("room-created", {
            room: {
                delivery: {
                    departure: delivery.deliveryMeta.departureAddress,
                    destination: delivery.deliveryMeta.destinationAddress,
                    id: delivery.id
                },
                id: room.id,
                members: users.map((user) => user.toShortResponse()),
                name: room.name
            },
            users: users.map((user) => user.id)
        });
    }

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
    async function sendMessage(req, res) {
        const {id} = req.user.token;
        const {room} = req;
        const {content} = req.body;
        let message;
        let sender;
        let users;

        if (typeof content !== "string" || content?.length <= 0) {
            return sendResponse(res, errors.invalidValues);
        }
        message = await messagesModel.create({
            content,
            senderId: id,
            roomId: room.id
        });
        res.status(200).send({id: message.id});
        sender = await message.getSender();
        users = await room.getUsers();
        message = {
            content,
            date: message.createdAt,
            id: message.id,
            room: {
                id: room.id,
                name: room.name
            },
            sender: sender.toShortResponse()
        };
        users.forEach(function (user) {
            if (user.id !== sender.id) {
                deliveriesModel.emitEvent("new-message-sent", {
                    message,
                    userId: user.id
                });
            }
        });
    }

    async function getRoomMessages(req, res) {
        let response;
        let {maxPageSize, index: pageIndex} = req.query;
        const {page_token} = req.headers;
        const {room} = req;
        const getParams = function (params) {
            const clone = Object.create(null);
            Object.assign(clone, params);
            clone.roomId = room.id;
            return clone;
        }
        maxPageSize = Number.parseInt(maxPageSize, 10);
        if (!Number.isFinite(maxPageSize)) {
            maxPageSize = 10;
        }
        pageIndex = Number.parseInt(pageIndex, 10);
        if (!Number.isFinite(pageIndex)) {
            pageIndex = undefined;
        }
        response = await messagePagination({
            getParams,
            maxPageSize,
            pageIndex,
            pageToken: page_token
        });
        res.status(200).json(response);
    }

    async function getRooms(req, res) {
        const {id} = req.user.token;
        const response = await roomsModel.getUserRooms(id);
        res.status(200).json({rooms: response});
    }

    return Object.freeze({
        ensureRoomExists,
        ensureUserInRoom,
        getRoomMessages,
        getRooms,
        sendMessage
    });
}
module.exports = getChatModule;