const { userServices } = require("../services/index.js");

createUser = async (req, res) => {
  try {
    const user = await userServices.createUser(req.body);
    if (user.original == `undefined` && user.original.errno === 1062) {
      res.status(404).json({
        type: "error",
        message: "Phone number already exists!",
      });
    }
    res.status(200).json({
      type: "succes",
      message: "User create succesfully",
      data: user,
    });
  } catch (error) {
    return error;
  }
};

findUserByPk = async (req, res) => {
  try {
    const user = await userServices.findUserByPk(req.params.userId);
    if (!user) {
      res.status(404).json({
        type: "error",
        message: "User not exists!",
      });
    }
    res.status(200).json(user);
  } catch (error) {
    return error;
  }
};

updateUserProfile = async (req, res) => {
  try {
    let data = {...req.body};
    if(req.file){
      data = {
        ...data,
        avatar: req.file.destination.split("public")[1] + "/" + req.file.filename
      };
    };
    const result = await userServices.updateUserProfile(req.params.userId, data);
    if( result.type != "succes") {
      res.status(404).json({
        type: "error",
        message: "Please enter a valid email and password!"
      });
    };
    res.status(200).json({
      type: "succes",
      message: "user update succesfuly!"
    });
  } catch (error) {
    return error;
  }
}
updateAvatar = async (req, res) => {
  try {
    const avatar = req.file.destination.split("public")[1] + "/" + req.file.filename;
    const result = await userServices.updateAvatar(req.params.userId, avatar);
    if( result.type != "succes") {
      res.status(404).json({
        type: "error",
        message: "User not found!"
      });
    };
    res.status(200).json({
      type: "succes",
      message: "avatar update succesfuly!"
    });
  } catch (error) {
    return error;
  }
}
updatePhoneNumber = async (req, res) => {
  try {
    const result = await userServices.updatePhoneNumber(req.params.userId, req.body.phone);
    if( result.type != "succes") {
      res.status(404).json({
        type: "error",
        message: "User not found!"
      });
    };
    res.status(200).json({
      type: "succes",
      message: "Phone number update succesfuly!"
    });
  } catch (error) {
    return error;
  }
};

deleteAvatar = async (req, res) => {
  try {
    const result = await userServices.deleteAvatar(req.params.userId);
    if (result.type != "succes") {
      res.status(404).json({
        type: "error",
        message: "Avatar not found"
      });
    }
    res.status(200).json({
      type: "succes",
      message: "Avatar delete succesfuly!"
    });
  } catch (error) {
    return error;
  }
}

deleteUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const result = await userServices.deleteUser(userId);
    if (result.type != "succes") {
      return res.status(404).json({
        type: "error",
        message: "User with that ID not found!",
      });
    };
    res.status(200).json({
      type: "succes",
      message: "User delete succesfuly!"
    });
  } catch (error) {
    return error
  }
}

module.exports = {
  createUser,
  findUserByPk,
  updateUserProfile,
  updateAvatar,
  updatePhoneNumber,
  deleteAvatar,
  deleteUser
};
