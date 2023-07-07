/*jslint
node, this, nomen
*/
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");


function defaultDestination(req, file, cb) {
    cb(null, "/dev/null");
}
function HashFileStorage(options) {
    let {destination} = options;
    this.getDestination = (destination || defaultDestination);
}

HashFileStorage.prototype._handleFile = function _handleFile(req, file, cb) {
    const {stream} = file;
    this.getDestination(req, file, function (err, path) {
        let outputStream;
        if (err) {
            cb(err);
        }
        if (fs.existsSync(path)) {
            cb(null, {path});
        } else {
            outputStream = fs.createWriteStream(path);
            stream.pipe(outputStream);
            outputStream.on("error", cb);
            outputStream.on("finish", function () {
                cb(null, {path, size: outputStream.bytesWritten});
            });
        }
    });
};

HashFileStorage.prototype._removeFile = function _removeFile(req, file, cb) {
    fs.unlink(file.path, cb);
};


function getDestination({cb, file, folderPath}) {
    const extension = path.extname(file.originalname);
    const hash = crypto.createHash("sha256");
    const {stream} = file;
    stream.on("readable", function () {
        const data = stream.read();
        if (data !== null) {
            hash.update(data);
        } else {
            cb(
                null,
                path.normalize(
                    folderPath +
                    "vamvam_" +
                    hash.digest("hex") +
                    extension
                )
            );
        }
    });
    stream.on("error", function (err) {
        cb(err);
    });
}
function hashedUploadHandler(
    fieldsOptions = {},
    limits = {fileSize: 6291560}
) {
    const result = multer({
        fileFilter: function (_, file, cb) {
            const {validator} = fieldsOptions[file.fieldname];
            if (typeof validator === "function") {
                validator(file, cb);
            } else {
                cb(null, true);
            }
        },
        limits,
        storage: new HashFileStorage({
            destination: function (_, file, cb) {
                const {
                    folderPath = "./"
                } = (fieldsOptions[file.fieldname] || {});
                getDestination({cb, file, folderPath});
            }
        })
    });
    return result;
}

function avatarValidator(file, cb) {
    const pattern = /png|jpg|jpeg/gi;
    if (pattern.test(file.mimetype)) {
        cb(null, true);
    } else {
        cb(null, false);
    }
}

function carInfosValidator(file, cb) {
    const pattern = /pdf/gi;
    if (pattern.test(file.mimetype)) {
        cb(null, true);
    } else {
        cb(null, false);
    }
}

module.exports = {
    avatarValidator,
    carInfosValidator,
    hashedUploadHandler
};