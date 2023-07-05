const multer = require("multer");
const path = require("path");

const avatarStorage = multer.diskStorage({
  destination: "public/uploads/avatars",
  filename: (req, file, cb) => {
    let fileName = file.originalname;
    const i = fileName.lastIndexOf(".");
    fileName = fileName.slice(0, i);
    const end = file.originalname.slice(i);
    fileName = fileName + "-" + Date.now() + end;

    cb(null, fileName);
  },
});

const checkFilterType = ({ file, cb, fileTypes }) => {
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
  
    if (extname) {
      return cb(null, true);
    } else {
      cb("Error: Veuillez n'utiliser que des images.");
    }
  };

const uploadImage = multer({
  storage: avatarStorage,
  fileFilter: (req, file, cb) => {
    checkFilterType({ cb, file, fileTypes: /png|jpeg|jpg/ });
  },
});

const uploadSingleImage = (fieldName) => util.promisify(uploadImage.single(fieldName));

module.exports = { uploadSingleImage };