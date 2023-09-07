/*jslint
node, nomen
*/
const { DataTypes } = require("sequelize");
const { CustomEmitter } = require("../utils/helpers");

function defineRoomModel(connection) {
  const emitter = new CustomEmitter();
  const room = connection.define(
    "room",
    {
      id: {
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        type: DataTypes.UUID,
      },
      name: {
        allowNull: false,
        type: DataTypes.STRING,
      },
    },
    {
      hooks: {
        beforeDestroy: async function (record) {
          const messagesToBeRemoved = await record.getMessages();
          Promise.all(messagesToBeRemoved.map(message => message.destroy()));
        },
      },
    }
  );
  room.prototype.toResponse = function () {
    const result = this.dataValues;
    return Object.freeze({
      id: result.id,
      name: result.name
    });
  };
  return room;
}

module.exports = defineRoomModel;
