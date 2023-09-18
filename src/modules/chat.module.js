/*jslint
node
*/
const {Delivery, Message, Room} = require("../models");
const {ressourcePaginator, sendResponse} = require("../utils/helpers");
const {errors} = require("../utils/system-messages");

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
                deliveriesModel.emitEvent("missed-messages-from-room", {
                    payload: datas,
                    userId
                });
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
                {payload: {updated: updated > 0}, userId}
            );
        }
    );
    deliveriesModel.addEventListener(
        "room-deletion-requested",
        async function (data) {
            const {deliveryId, members} = data;
            const room = await roomsModel.findOne({where: {deliveryId}});
            if (room !== null) {
                await roomsModel.destroy({
                    individualHooks: true,
                    where: {id: room.id}
                });
                if (Array.isArray(members)) {
                    members.forEach(function (userId) {
                        deliveriesModel.emitEvent("room-deleted", {
                            userId,
                            payload: {id: room.id, name: room.name}
                        });
                    });
                }
            }
        }
    );
    
    async function createRoom(data) {
        const {delivery, name, users} = data;
        let members;
        let room = await roomsModel.create({name});
        await room.setUsers(users);
        await room.setDelivery(delivery);
        members = users.map((user) => user.toShortResponse());
        users.forEach(function (user) {
            deliveriesModel.emitEvent("room-created", {
                payload: {
                    delivery: {
                        departure: delivery.deliveryMeta.departureAddress,
                        destination: delivery.deliveryMeta.destinationAddress,
                        id: delivery.id
                    },
                    id: room.id,
                    members,
                    name: room.name
                },
                userId: user.id
            });
        })
    }

    async function ensureRoomExists(req, res, next) {
        const {roomId} = req.body;
        let room;
        if (typeof roomId !== "string" || roomId === "") {
            return sendResponse(res, errors.invalidValues);
        }
        room = await roomsModel.findOne({where: {id: roomId}});
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
                    payload: message,
                    userId: user.id
                });
            }
        });
    }

    async function getRoomMessages(req, res) {
        let response;
        let {maxPageSize, skip} = req.query;
        const pageToken = req.headers["page-token"];
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
        skip = Number.parseInt(skip, 10);
        if (!Number.isFinite(skip)) {
            skip = undefined;
        }
        response = await messagePagination({
            getParams,
            maxPageSize,
            skip,
            pageToken
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