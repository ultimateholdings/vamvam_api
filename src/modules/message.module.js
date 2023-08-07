/*jslint
node
*/
const { Message, User } = require("../models/index");
const { propertiesPicker } = require("../utils/helpers");

function getMessageModule({ messageTest }) {
  const messageModel = messageTest || Message;
  const messageProps = ["content", "senderId", "roomId"];

  async function createMessage(req, res) {
    try {
      let propertiesCreate;
      const pickedProperties = propertiesPicker(req.body);
      propertiesCreate = pickedProperties(messageProps);
      if (propertiesCreate !== undefined) {
        const message = await messageModel.create({
          content: propertiesCreate.content,
          senderId: propertiesCreate.senderId,
          roomId: propertiesCreate.roomId,
        });
        res.status(200).json({
          content: message.content,
          messageId: message.id,
          senderId: message.senderId,
          roomId: message.roomId
        });
        messageModel?.emitEvent("new-message", {
          content: message.content,
          messageId: message.id,
          senderId: message.senderId,
          roomId: message.roomId
        });
      } else {
        res.status(400).json({
          message: "cannot create message with invalid values",
        });
      }
    } catch (error) {
      console.log("Error: ", error);
    }
  }

  async function getMessageInfos(req, res) {
    const {messageId} = req.body;
    try {
      let message = await messageModel.findByPk(messageId);
      if (message !== null) {
        res.status(200).json({
          content: message.content,
          messageId: message.id,
          senderId: message.senderId,
          roomId: message.roomId
        });
      } else {
        res.status(404).json({
          message: "Message not found!",
        });
      }
    } catch (error) {
      console.log(error);
    }
  }

  async function getRoomMessages(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 8;
      const offset = (page - 1) * limit;
      const {roomId} = req.body;

      let response = await messageModel
        .findAndCountAll({
          where: {
            roomId: roomId
          },
          limit: limit,
          offset: offset,
          order: [['createdAt', 'DESC']],
          include: [
            {
              model: User,
              attributes: ["id", "firstName", "lastName", "avatar"],
            },
          ],
        });
        const data = response.rows.map(message =>({
          messageId: message.id,
          roomId: message.roomId,
          content: message.content,
          date: message.createdAt,
          userId: message.user.id,
          avatar: message.user.avatar,
          firstName: message.user.firstName,
          lastName: message.user.lastName
        }));
      if (response !== null) {
        res.status(200).json({
          succes: true,
          totalmessage: response.count,
          totalPage: Math.ceil(response.count / limit),
          messages: data
        });
      } else {
        res.status(400).json({
          succes: false,
          message: "Messages not found!",
        }); 
      }
    } catch (error) {
      console.log(error);
      return error;
    }
  };

  async function updateMessageReader(req, res){
    const { messageId, userId } = req.body;
    try {
      const message = await messageModel.findOne({ where: { id: messageId }});
      if(!message){
        res.status(404).json({
          succes: false,
          message: "Message not found!"
        });
      }
      let readers = message.reader || [];
      if(!readers.includes(userId)){
        readers.push(userId);
      };
      message.reader = readers;
      const updateReader = await message.save();
      if(updateReader.reader.includes(userId)){
        res.status(200).json({
          messageId: message.id,
          newReader: userId,
          roomId: message.roomId,
        });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({message: "An error occurred while updating the message!!"})
    }  
  }

  return Object.freeze({
    createMessage,
    getMessageInfos,
    getRoomMessages,
    updateMessageReader
  });
}

module.exports = getMessageModule;
