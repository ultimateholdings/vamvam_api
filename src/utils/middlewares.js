/*jslint node */
const {jwtWrapper} = require("../utils/helpers");
const {errors} = require("../utils/config");

function sendAuthFaillure(res) {
    const {message, status} = errors.notAuthorized;
    res.status(status).json({message});
}
/*jslint-disable*/
async function protectRoute(req, res, next) {
    const [, token] = (req.headers.authorization || "").split(" ");
    const jwtHandler = jwtWrapper();
    let payload;
    if (token === null || token === undefined) {
        sendAuthFaillure(res);
    } else {
        try {
            payload = await jwtHandler.verify(token);
            req.user = payload;
            next();
        } catch (error) {
            sendAuthFaillure(res, error);
        }
    }
}
/*jslint-enable*/
function socketAuthenticator(allowedRoles = ["driver", "client"]) {
    return async function authenticateSocket(socket, next) {
        const {token} = socket.handshake.auth || {};
        const jwtHandler = jwtWrapper();
        const err = new Error("Forbidden Access");
        err.data = errors.notAuthorized.message;
        let payload;
        if (token === undefined || token === null) {
            next(err);
        } else {
            try {
                payload = await jwtHandler.verify(token);
                if (Array.isArray(allowedRoles) && allowedRoles.includes(
                    payload.token.role
                )) {
                    socket.user = payload.token;
                    next();
                } else {
                    next(err);
                }
            } catch (error) {
                error.data = errors.invalidCredentials.message;
                next(error);
            }
        }

    };
}

function verifyValidId(req, res, next) {
    const {id} = req.body;
    const {message, status} = errors.invalidValues;
    if (id === null || id === undefined) {
        res.status(status).json({message});
    } else {
        next();
    }
}

function allowRoles(roles = []) {
    return function (req, res, next) {
        const role = req?.user?.token?.role;
        if (Array.isArray(roles) && roles.includes(role)) {
            next();
        } else {
            sendAuthFaillure(res);
        }
    };
}

module.exports = Object.freeze({
    allowRoles,
/*jslint-disable*/
    protectRoute,
/*jslint-enable*/
    socketAuthenticator,
    verifyValidId
});