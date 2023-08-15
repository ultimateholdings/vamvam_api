const { DataTypes } = require("sequelize");

function defineUserRoomModel(connection) {
  const userRoom = connection.define(
    "Room_User",
    {
      id: {
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        type: DataTypes.UUID,
        allowNull: false,
      },
    },
    { timestamps: false }
  );

  return userRoom;
}

module.exports = defineUserRoomModel;
