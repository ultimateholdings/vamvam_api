/*jslint node */
const {jwtWrapper, sendResponse} = require("../utils/helpers");
const {errors} = require("../utils/config");
const {Blacklist} = require("../models");

/*jslint-disable*/
function routeProtectionFactory(model) {
    async function isRevoked(payload) {
        let issuedAt;
        let minimumIat;
        const globalInvalidation = await model.getGlobalIat();
        const userInvalidation = await model.getUserIat(payload.id);
        minimumIat = Math.max(globalInvalidation ?? 0, userInvalidation ?? 0);
        if (Number.isFinite(minimumIat)) {
            minimumIat = new Date(minimumIat);
        }
        issuedAt = new Date(payload.iat * 1000);
        if (issuedAt < minimumIat) {
            return true;
        }
        return false;
    }
    async function protectRoute(req, res, next) {
        const [, token] = (req.headers.authorization || "").split(" ");
        const jwtHandler = jwtWrapper();
        let payload;
        let revoked;
        if (token === null || token === undefined) {
            return sendResponse(res, errors.notAuthorized);
        }
        try {
            payload = await jwtHandler.verify(token);
            if(payload.valid === false) {
                return sendResponse(res, errors.tokenInvalid);
            }
            revoked = await isRevoked(payload.token);
            if (revoked) {
                return sendResponse(res, errors.notAuthorized);
            }
            req.user = payload;
            next();
        } catch (error) {
            return sendResponse(res,errors.notAuthorized, error);
        }
    }
    return Object.freeze(protectRoute);
}
/*jslint-enable*/
function socketAuthenticator(allowedRoles = ["driver", "client"]) {
    const jwtHandler = jwtWrapper();
    const err = new Error("Forbidden Access");
    err.data = errors.notAuthorized.message;
    return async function authenticateSocket(socket, next) {
        const [, token] = (socket.handshake.headers.authorization ?? "").split(" ");
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
            sendResponse(res, errors.forbiddenAccess);
        }
    };
}



module.exports = Object.freeze({
    allowRoles,
/*jslint-disable*/
    protectRoute: routeProtectionFactory(Blacklist),
/*jslint-enable*/
    socketAuthenticator,
    verifyValidId
});