/*jslint node */
const {jwtWrapper, sendResponse} = require("../utils/helpers");
const {errors} = require("../utils/config");

/*jslint-disable*/
async function protectRoute(req, res, next) {
    const [, token] = (req.headers.authorization || "").split(" ");
    const jwtHandler = jwtWrapper();
    let payload;
    if (token === null || token === undefined) {
        return sendResponse(res, errors.notAuthorized);
    }
    try {
        payload = await jwtHandler.verify(token);
        if(payload.valid === true) {
            req.user = payload;
            next();
        } else {
            return sendResponse(res, errors.tokenInvalid);
        }
    } catch (error) {
        sendResponse(res,errors.notAuthorized, error);
    }
}
/*jslint-enable*/
function socketAuthenticator(allowedRoles = ["driver", "client"]) {
    return async function authenticateSocket(socket, next) {
        const [, token] = (socket.handshake.headers.authorization ?? "").split(" ");
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
                    err.data = errors.forbiddenAccess.message;
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
            sendResponse(res, errors.notAuthorized);
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