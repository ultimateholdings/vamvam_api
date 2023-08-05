/*jslint
node
*/
const Sequelize = require("sequelize");
const { Room, User, Message } = require("../models/index");
const { propertiesPicker } = require("../utils/helpers");
const { eq: opEq, in: opIn } = Sequelize.Op;

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
      const pickedProperties = propertiesPicker(req.body);
      propertiesCreate = pickedProperties(roomProps);
      if (propertiesCreate !== undefined) {
        let response = await roomModel.create({
          name: propertiesCreate.name,
        });
        await addUsersInRoom(propertiesCreate.phoneList, response.id);
        res.status(200).json(response);
      }
    } catch (error) {
      return error;
    }
  }

  async function getRoom(req, res) {
    const roomId = req.params.roomId;
    try {
      const room = await roomModel.findOne({
        where: { id: roomId },
        include: Message,
      });
      const users = await room.getUsers();
      if (!room) {
        res.status(404).json({ succes: false });
      }
      res.status(200).json({
        succes: true,
        data: { room, users },
      });
    } catch (error) {
      return error;
    }
  }

  async function getUserRooms(req, res) {
    const { userId } = req.params;
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
            attributes: ["id", "content", "createdAt"],
            include: [
              {
                model: User,
                attributes: ["id", "firstName", "lastName"],
              },
            ],
          },
        ],
      });
      res.status(200).json({
        succes: true,
        data: rooms,
      });
    } catch (error) {
      return error;
    }
  }

  async function deleteRoom(req, res) {
    const { roomId } = req.params;
    try {
      await roomModel.destroy({
        where: { id: roomId },
        individualHooks: true,
      });
      return res.status(204).send();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to delete room" });
    }
  }

  return Object.freeze({
    createRoom,
    getRoom,
    getUserRooms,
    deleteRoom,
  });
}

module.exports = getRoomModule;
