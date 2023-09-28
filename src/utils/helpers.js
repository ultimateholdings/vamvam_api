/*jslint
node, this
*/
"use strict";
const {EventEmitter} = require("node:events");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {errors} = require("../utils/system-messages");
const {
  getFirebaseConfig,
  getOTPConfig,
  getPaymentConfig
} = require("../utils/config");
const {ValidationError} = require("sequelize");
const CustomEmitter = function (name) {
  const self = this;
  this.name = name;
  this.decorate = function (obj) {
    obj.emitEvent = function (name, data) {
      self.emit(name, data);
    };
    obj.addEventListener = function (name, func) {
      self.on(name, func);
    };
    obj.forward = function (eventName) {
      return {
        to: function (emitter) {
          obj.addEventListener(eventName, function (data) {
            if (typeof emitter?.emitEvent === "function") {
              emitter.emitEvent(eventName, data);
            }
          });
        }
      };
    };
  };
  
};
const {
  TOKEN_EXP: expiration = 3600,
  JWT_SECRET: secret = "test1234butdefault"
} = process.env;
CustomEmitter.prototype = EventEmitter.prototype;

function cloneObject(object) {
  const tmp = Object.create(null);
  Object.assign(tmp, object);
  return tmp;
}

function fileExists(path) {
  if (typeof path === "string") {
    return new Promise(function (res) {
      fs.access(path, fs.constants.F_OK, function (err) {
        if (err) {
          res(false);
        } else {
          res(true);
        }
      });
    });
  } else {
    return Promise.resolve(false);
  }
}

function deleteFile(path) {
  if (typeof path === "string") {
    return new Promise(function (res) {
      fs.unlink(path, function (err) {
        if (err) {
          res(false);
        }
        res(true);
      });
    });
  }
  return Promise.resolve(false);
}

function jwtWrapper(expiresIn = expiration) {
  return {
    sign(payload) {
      return jwt.sign(payload, secret, { expiresIn });
    },
    verify: async function (token) {
      let verifiedToken;
      try {
        verifiedToken = await new Promise(function tokenExecutor(res, rej) {
          jwt.verify(token, secret, function (err, decoded) {
            if (decoded === undefined) {
              rej(err);
            } else {
              res(decoded);
            }
          });
        });
        return { token: verifiedToken, valid: true };
      } catch (error) {
        return { errorCode: error.code, valid: false };
      }
    }
  };
}
function sendResponse(res, content, data = {}) {
  res.status(content.status).send({
    data,
    message: content.message
  });
}

function isValidPoint(point) {
  if (point !== null && point !== undefined) {
    return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
  }
  return false;
}

function toDbPoint(point) {
  return {
    coordinates: [point?.latitude, point?.longitude],
    type: "Point"
  };
}

function toDbLineString(points) {
  let lineString;
  if (Array.isArray(points)) {
    lineString = { type: "LineString" };
    lineString.coordinates = points.map(function (point) {
      if (isValidLocation(point)) {
        return [point.latitude, point.longitude];
      }
      throw new Error("Invalid location !!!");
    });
  }
  return lineString;
}

function formatDbLineString(lineString) {
  let result = null;
  if (lineString !== null && lineString !== undefined) {
    result = lineString.coordinates.map(function ([latitude, longitude]) {
      return Object.freeze({ latitude, longitude });
    });
  }
  return result;
}

function formatDbPoint(dbPoint) {
  let result = null;
  if (dbPoint !== null && dbPoint !== undefined) {
    result = {
      latitude: dbPoint.coordinates[0],
      longitude: dbPoint.coordinates[1]
    };
  }
  return result;
}

function isValidLocation(location) {
  let result;
  if (Array.isArray(location)) {
    result = location.every(isValidPoint);
  } else if (location !== null && location !== undefined) {
    result = isValidPoint(location);
  }
  return result;
}

function getFileHash(path) {
  return new Promise(function executor(res, rej) {
    const stream = fs.createReadStream(path);
    const hash = crypto.createHash("sha256");
    stream.on("readable", function () {
      const data = stream.read();
      if (data !== null) {
        hash.update(data);
      } else {
        res(hash.digest("hex"));
        stream.close();
      }
    });
    stream.on("error", function (err) {
      rej(err);
    });
  });
}

async function fetchUrl({
  body,
  headers = { "content-type": "application/json" },
  method = "POST",
  url,
}) {
  const { default: fetch } = await import("node-fetch");
  const options = {
    headers,
    method,
  };
  if (body !== null) {
    options.body = JSON.stringify(body);
  }
  return fetch(url, options);
}

function errorHandler(func) {
  return async function handleEndPoint(req, res, next) {
    let err;
    let content;
    try {
      await func(req, res, next);
    } catch (error) {
      if (ValidationError.prototype.isPrototypeOf(error)) {
        err = errors.invalidValues;
        content = error.errors
          .map(function ({ message }) {
            return message.replace(/^\w*\./, "");
          }, {})
          .join(" and ");
        return sendResponse(res, err, content);
      } else {
        err = errors.internalError;
        return sendResponse(res, err);
      }
    }
  };
}

function propertiesPicker(object) {
  return function (props) {
    let result;
    if (typeof object === "object") {
      result = Object.entries(object).reduce(function (acc, entry) {
        let [key, value] = entry;
        if (props.includes(key) && value !== null && value !== undefined) {
          acc[key] = value;
        }
        return acc;
      }, Object.create(null));
    }
    if (Object.keys(result || {}).length > 0) {
      return result;
    }
  };
}

function getOTPService(model) {
  const config = getOTPConfig();
  const getTtl = () => model.getSettings().ttl;
  async function sendCode({phone, signature, type = "auth"}) {
    let response;
    let content;
    response = await model.canRequest({
      phone,
      ttlInSeconds: getTtl(),
      type
    });
    if (!response) {
      response = cloneObject(errors.ttlNotExpired);
      response.sent = false;
      return response;
    }
    try {
      response = await fetchUrl({
        body: config.getSendingBody(phone, signature),
        url: config.sent_url,
      });
    } catch (error) {
      response = cloneObject(errors.internalError);
      response.sent = false;
      response.content = error.toString();
      return response;
    }
    if (response.ok) {
      response = await response.json();
      await model.upsert(
        {
          phone,
          pinId: response.pinId,
          type,
        },
        { fields: ["phone", "type"] }
      );
      return { pinId: response.pinId, sent: true };
    } else {
      response = await response.json();
      content = cloneObject(errors.otpSendingFail);
      content.sent = false;
      content.content = response.message;
      return content;
    }
  }

  async function verifyCode({ code, phone, type = "auth" }) {
    let response = await model.findOne({ where: { phone, type } });
    if (response === null) {
      response = cloneObject(errors.requestOTP);
      response.verified = false;
      return response;
    }
    try {
      response = await fetchUrl({
        body: config.getVerificationBody(response.pinId, code),
        url: config.verify_url,
      });
      if (response.ok) {
        response = await response.json();
        if (response.verified && response.msisdn === phone) {
          await model.destroy({where: {phone, type}});
          return {verified: true};
        }
        response = cloneObject(errors.forbiddenAccess);
        response.verified = false;
        return response;
      } else {
        response = cloneObject(errors.invalidCredentials);
        response.verified = false;
        return response;
      }
    } catch (error) {
      response = cloneObject(errors.internalError);
      response.content = error.toString();
      response.verified = false;
      return response;
    }
  }

  return Object.freeze({getTtl, sendCode, verifyCode});
}

function ressourcePaginator(getRessources, expiration = 3600000) {
  const tokenManager = jwtWrapper(expiration);
  async function handleInvalidToken({
    getParams,
    maxPageSize,
    refreshed = false,
  }) {
    let nextPageToken = null;
    const {lastId, values} = await getRessources(
      getParams({ maxSize: maxPageSize, offset: 0 })
    );
    if (Array.isArray(values) && values.length > 0) {
      nextPageToken = tokenManager.sign({
        lastId,
        offset: maxPageSize,
      });
    }
    return {
      nextPageToken,
      refreshed,
      results: values,
    };
  }
  async function handleValidToken({
    getParams,
    maxPageSize,
    skip,
    tokenDatas = {}
  }) {
    let nextPageToken;
    let offset;
    let results;
    offset = (
        Number.isFinite(skip)
        ? skip
        : tokenDatas.offset
    );
    results = await getRessources(getParams({
        maxSize: maxPageSize,
        offset
    }));
    nextPageToken = (
        results.values.length < maxPageSize
        ? null
        : tokenManager.sign({
            lastId: results.lastId,
            offset: offset + maxPageSize
        })
    );
    if (
        (results.formerLastId !== tokenDatas.lastId) &&
        (nextPageToken !== null) &&
        (!Number.isFinite(skip))
    ) {
        results = await handleInvalidToken({
            getParams,
            maxSize: maxPageSize,
            refreshed: true
        });
    } else {
        results = {
            nextPageToken,
            refreshed: false,
            results: results.values
        };
    }
    return results;
  }

  return async function paginate({
    getParams = cloneObject,
    maxPageSize,
    skip,
    pageToken
  }) {
    let datas;
    let results;
    if (Number.isFinite(skip)) {
      return handleValidToken({
          getParams,
          maxPageSize,
          skip
      });
    }
    try {
      datas = await tokenManager.verify(pageToken);
      if (datas.valid) {
        results = await handleValidToken({
          getParams,
          maxPageSize,
          tokenDatas: datas.token
        });
      } else {
        results = await handleInvalidToken({getParams, maxPageSize});
      }
    } catch (err) {
      console.error(err);
      results = await handleInvalidToken({getParams, maxPageSize});
    }
    return results;
  };
}


function sendCloudMessage({ body, meta, title, to }) {
  const config = getFirebaseConfig();
  return fetchUrl({
    body: {
      data: meta,
      notification: {
        body,
        mutable_content: true,
        title,
      },
      to,
    },
    headers: config.headers,
    url: config.url,
  });
}
function getPaymentService(paymentModel) {
  async function initTrans(payload, driverId, packId) {
    let response;
    const config = getPaymentConfig()
    try {
      response = await fetchUrl({
        body: payload,
        headers: {
          Authorization: `Bearer ${config.flw_key}`,
          "Content-Type": "application/json",
        },
        url: config.url_charge
      });
    } catch (error) {
      response = errors.internalError;
      console.error(error);
      return {
        code: response.status,
        message: response.message,
        init: false,
      };
    }
    if (response.ok) {
      response = await response.json();
      await paymentModel.create({
        transId: response.data.id,
        driverId: driverId,
        packId: packId,
      });
      return { init: true };
    } else {
      response = await response.json();
      return {
        code: errors.paymentSendingFail.status,
        content: response.message,
        message: errors.paymentSendingFail.message,
        init: false,
      };
    }
  }

  async function verifyTrans(expectedAmount, id) {
    let response;
    const config = getPaymentConfig(id);
    response = await fetchUrl({
      headers: {
        Authorization: `Bearer ${config.flw_key}`,
        "Content-Type": "application/json",
      },
      method: "GET",
      url: config.url_verify
    });
    if (response.ok) {
      response = await response.json();
      if (
        response.data.status === "successful" &&
        response.data.amount >= expectedAmount &&
        response.data.currency === config.expect_currency
      ) {
        return {
          verifiedTrans: true
        };
      } else {
        return {
          code: errors.paymentApproveFail.status,
          message: errors.paymentApproveFail.message,
          verifiedTrans: false,
        };
      }
    } else {
      response = await response.json();
      return {
        code: errors.paymentApproveFail.status,
        message: errors.paymentApproveFail.message,
        verifiedTrans: false
      };
    }
  }
  return Object.freeze({ initTrans, verifyTrans });
}
function paymentManager(paymentService) {
  return {
    initTransaction: function (payload, driverId, packId) {
      return paymentService.initTrans(payload, driverId, packId);
    },
    verifyTransaction: async function (expectedAmount, id) {
      let isVerified = await paymentService.verifyTrans(expectedAmount, id);
      return isVerified;
    },
  };
}

function pathToURL(filePath) {
  let rootDir;
  if (typeof filePath === "string" && filePath.length > 0) {
    rootDir = path.normalize(path.dirname(filePath)).split(path.sep).at(-1);
    return "/" + rootDir + "/" + path.basename(filePath);
  }
}
async function generateCode(byteSize = 5) {
  const {
      default: encoder
  } = await import("base32-encode");
  return encoder(crypto.randomBytes(byteSize), "Crockford");
}

module.exports = Object.freeze({
  CustomEmitter,
  comparePassword(givenPassword, hash) {
    return new Promise(function executor(resolve, reject) {
      bcrypt.compare(givenPassword, hash, function (err, result) {
        if (err !== null && err !== undefined) {
          reject(err);
        }
        resolve(result === true);
      });
    });
  },
  deleteFile,
  errorHandler,
  fileExists,
  formatDbLineString,
  formatDbPoint,
  generateCode,
  getFileHash,
  getOTPService,
  hashPassword(password) {
    return new Promise(function executor(resolve, reject) {
      bcrypt.hash(password, 10, function (err, result) {
        if (err !== null && err !== undefined) {
          reject(err);
        }
        resolve(result);
      });
    });
  },
  isValidLocation,
  jwtWrapper,
  pathToURL,
  propertiesPicker,
  ressourcePaginator,
  sendCloudMessage,
  sendResponse,
  toDbLineString,
  toDbPoint,
  getPaymentService,
  paymentManager
});
