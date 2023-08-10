/*jslint
node
*/
const Sequelize = require("sequelize");
const { Room, User, Message } = require("../models/index");
const { propertiesPicker } = require("../utils/helpers");
const { eq: opEq, in: opIn, not: opNot, ne: opdif } = Sequelize.Op;

function getRoomModule({ roomTest, userTest }) {
  const roomModel = roomTest || Room;
  const userModel = userTest || User;
  const roomProps = ["name", "phoneList"];

  async function getUsersByPhone(phoneList) {
    try {
      const users = await userModel.findAll({
        where: {
          phone: {
            [opIn]: phoneList,
          },
        },
      });
      return users;
    } catch (error) {
      return error;
    }
  }

  async function addUsersInRoom(phoneList, roomId) {
    const users = await getUsersByPhone(phoneList);
    const room = await Room.findByPk(roomId);
    await room.setUsers(users);
  }

  async function createRoom(req, res) {
    try {
      let propertiesCreate;
      let roomUsers;
      const pickedProperties = propertiesPicker(req.body);
      propertiesCreate = pickedProperties(roomProps);
      if (propertiesCreate !== undefined) {
        let room = await roomModel.create({
          name: propertiesCreate.name,
        });
        await addUsersInRoom(propertiesCreate.phoneList, room.id);
        roomUsers = await room.getUsers({
          attributes: ["id", "firstName", "lastName", "avatar"],
        });
        res.status(200).json({
          roomId: room.id,
          name: room.name,
          users: roomUsers.map((user) => ({
            userId: user.id,
            firtName: user.firstName,
            lastName: user.lastName,
            avatar: user.avatar,
          })),
        });
        roomModel?.emitEvent("new-room", {
          name: room.name,
          roomId: room.roomId,
          users: roomUsers.map((user) => ({
            userId: user.id,
            firtName: user.firstName,
            lastName: user.lastName,
            avatar: user.avatar,
          })),
        });
      }
    } catch (error) {
      return error;
    }
  }

  async function getRoom(req, res) {
    const { roomId } = req.body;
    try {
      const room = await roomModel.findOne({
        where: { id: roomId },
        attributes: ["id", "name"],
        include: [
          {
            model: User,
            attributes: ["id", "firstName", "lastName", "avatar"],
          },
        ],
      });
      if (!room) {
        res.status(404).json({ succes: false });
      }
      res.status(200).json({
        succes: true,
        roomId: room.id,
        name: room.name,
        users: room.users.map((user) => ({
          userId: user.id,
          firtName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
        })),
      });
    } catch (error) {
      return error;
    }
  }

  async function getUserRooms(req, res) {
    let data;
    const { userId } = req.body;
    try {
      const user = await userModel.findByPk(userId);
      if (!user) {
        res.status(404).json({
          succes: false,
          message: "User not found!",
        });
      }
      const rooms = await user.getRooms({
        attributes: ["id", "name"],
        include: [
          {
            model: Message,
            required: false,
            order: [["createdAt", "DESC"]],
            attributes: ["id", "content", "createdAt", "senderId"],
            limit: 1,
            include: [
              {
                model: User,
                required: false,
                attributes: ["firstName", "lastName", "avatar"],
              },
            ],
          },
        ],
      });
      data = rooms.map(room => ({
        roomId: room.id,
        name: room.name,
        senderId: room.Messages.length > 0 ? room.Messages[0].dataValues.senderId : '' ,
        date: room.Messages.length > 0 ? room.Messages[0].dataValues.createdAt : '',
        messageId: room.Messages.length > 0 ? room.Messages[0].dataValues.id : '',
        content: room.Messages.length > 0 ? room.Messages[0].dataValues.content : '',
        avatar: room.Messages.length > 0 ? room.Messages[0].user.avatar : '',
        lastName: room.Messages.length > 0 ? room.Messages[0].user.lastName : '',
        firstName: room.Messages.length > 0 ? room.Messages[0].user.firstName : '',
      }))
      res.status(200).json({
        succes: true,
        data: data,
      });
    } catch (error) {
      return error;
    }
  }

  async function deleteRoom(req, res) {
    const { roomId } = req.body;
    try {
      await roomModel.destroy({
        where: { id: roomId },
        individualHooks: true,
      });
      res.status(204).send();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to delete room" });
    }
  }
  async function getRoomMissMessage(req, res) {
    let data;
    const { userId } = req.body;
    try {
      const rooms = await roomModel.findAll({
        attributes: ["id", "name"],
        include: [
          {
            model: Message,
            attributes: [
              [Sequelize.fn("COUNT", Sequelize.col("content")), "n_message"],
            ],
            required: false,
            where: {
              reader: {
                [opNot]: [userId]
              },
              senderId: {
                [opdif]: [userId]
              },
            },
          },
        ],
      });
      data = rooms.map((room) => ({
        roomId: room.id,
        missedCount: room.Messages.length > 0 ? room.Messages[0].dataValues.n_message : 0,
      }));
      res.status(200).json({ data });
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: "An error occurred while retrieving rooms!" });
    }
  }
  return Object.freeze({
    createRoom,
    getRoom,
    getUserRooms,
    getRoomMissMessage,
    deleteRoom,
  });
}

module.exports = getRoomModule;
