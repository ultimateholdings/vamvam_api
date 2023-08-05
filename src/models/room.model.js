/*jslint
node, nomen
*/
const { DataTypes } = require("sequelize");

function defineRoomModel(connection) {
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

  return room;
}

module.exports = defineRoomModel;
