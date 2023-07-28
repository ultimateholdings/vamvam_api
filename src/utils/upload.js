/*jslint
node, this, nomen
*/
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const {promisify} = require("node:util");
const {fileExists} = require("./helpers")

const copyAsync = promisify(fs.copyFile);
const unlinkAsync = promisify(fs.unlink);

function defaultDestination(req, file, cb) {
    cb(null, "/dev/null");
}
function HashFileStorage(options) {
    let {destination} = options;
    this.getDestination = (destination || defaultDestination);
}

HashFileStorage.prototype._handleFile = function _handleFile(req, file, cb) {
    this.getDestination(req, file, cb);
};

HashFileStorage.prototype._removeFile = function _removeFile(req, file, cb) {
    fs.unlink(file.path, cb);
};


function getDestination({cb, file, folderPath}) {
    const extension = path.extname(file.originalname);
    const hash = crypto.createHash("sha256");
    const tempPath = "_vamvam"+ crypto.randomUUID();
    const outStream = fs.createWriteStream(tempPath); 
    file.stream.pipe(outStream);
    file.stream.on("data", function (data) {
        hash.update(data);
    });
    outStream.on("error", cb);
    outStream.on("finish", function () {
        outStream.close();
    });
    outStream.on("close", async function () {
        let exists;
        const finalPath = path.normalize(
            folderPath +
            "vamvam_" +
            hash.digest("hex") +
            extension
        );
        exists = await fileExists(finalPath);
        if (!exists) {
            await copyAsync(tempPath, finalPath);
        }
        await unlinkAsync(tempPath);
        cb(null, {
            basename: path.basename(finalPath),
            path: finalPath,
            size: outStream.bytesWritten
        });
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