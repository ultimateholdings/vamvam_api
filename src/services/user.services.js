const fs = require("fs");
const path = require("path");
const { User } = require("../models/index");

async function deleteAvatarPath(modelName, id, ) {
  const user = await modelName.findByPk(id);
  if (!user) {
    return false;
  }
  const avatarPath = path.join(__dirname, "../../public/", user.avatar);
  fs.unlinkSync(avatarPath);
  return true;
}

createUser = async (body) => {
  try {
    const user = await User.create({
      phone: body.phone,
    });
    return user;
  } catch (error) {
    console.log("User create error: ", error);
    return error;
  }
};

findUserByPk = async (userId) => {
  try {
    const user = await User.findByPk(userId);
    return user;
  } catch (error) {
    console.log("User findByPk error: ", error);
    return error;
  }
};

updateUserProfile = async (userId, body) => {
  try {
    const result = await User.update(
      {
        firstName: body.firstName,
        lastName: body.lastName,
        avatar: body.avatar,
        email: body.email,
        password: body.password,
      },
      {
        where: {
          userId: userId,
        },
        individualHooks: true,
      }
    );
    if (result[0] === 0) {
      return {
        type: "error",
      };
    } else {
      return {
        type: "succes",
      };
    }
  } catch (error) {
    console.log("User update error: ", error);
    return error;
  }
};

updateAvatar = async (userId, avatar) => {
  try {
    const result = await User.update(
      { avatar: avatar },
      {
        where: {
          userId: userId,
        },
      }
    );
    if (result[0] === 0) {
      return {
        type: "error",
      };
    } else {
      return {
        type: "succes",
      };
    }
  } catch (error) {
    console.log("User Avatar update error: ", error);
    return error;
  }
};
updatePhoneNumber = async (userId, phone) => {
  try {
    const result = await User.update(
      { phone: phone },
      {
        where: {
          userId: userId,
        },
      }
    );
    if (result[0] === 0) {
      return {
        type: "error",
      };
    } else {
      return {
        type: "succes",
      };
    }
  } catch (error) {
    console.log("User Phone update error: ", error);
    return error;
  }
};

deleteAvatar = async (userId) => {
  try {
    deleteAvatarPath(User, userId);
    const result = await User.update(
      { avatar: null },
      {
        where: {
          userId: userId,
        },
      }
    );
    if (result[0] === 0) {
      return {
        type: "error",
      };
    } else {
      return {
        type: "succes",
      };
    }
  } catch (error) {
    console.log("Avatar delete error: ", error);
    return error;
  }
};

deleteUser = async (userId) => {
  try {
    deleteAvatarPath(User, userId);
    const result = await User.destroy({
      where: { userId: userId },
      force: true,
    });
    if (result === 0) {
      return {
        type: "error",
      };
    }
    return {
      type: "succes",
    };
  } catch (error) {
    console.log("User delete error: ", error);
    return error;
  }
};
module.exports = {
  createUser,
  findUserByPk,
  updateUserProfile,
  updateAvatar,
  updatePhoneNumber,
  deleteAvatar,
  deleteUser,
};
