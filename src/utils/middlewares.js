/*jslint node */
const {jwtWrapper, sendResponse} = require("../utils/helpers");
const {errors} = require("../utils/system-messages");
const {Blacklist} = require("../models");
let routeProtector;
function routeProtectionFactory(model) {
    const jwtHandler = jwtWrapper();
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
    function parseToken(headers) {
        let result = headers.authorization ?? "";
        result = result.trim().split(" ");
        return result.at(-1);
    }
    async function protectRoute(req, res, next) {
        const token = parseToken(req.headers);
        let payload;
        let revoked;
        if (token.length === 0) {
            return sendResponse(res, errors.notAuthorized);
        }
        try {
            payload = await jwtHandler.verify(token);
            if (payload.valid === false) {
                return sendResponse(res, errors.tokenInvalid);
            }
            revoked = await isRevoked(payload.token);
            if (revoked) {
                return sendResponse(res, errors.notAuthorized);
            }
            req.user = payload;
            next();
        } catch (error) {
            return sendResponse(res, errors.notAuthorized, error);
        }
    }
    function socketAuthenticator(allowedRoles = ["driver", "client"]) {
        const err = new Error("Forbidden Access");
        err.data = errors.notAuthorized.message;
        return async function authenticateSocket(socket, next) {
            const token = parseToken(socket.handshake.headers);
            let payload;
            let revoked;
            if (token.length === 0) {
                next(err);
            } else {
                try {
                    payload = await jwtHandler.verify(token);
                    revoked = await isRevoked(payload.token);
                    if (revoked) {
                        return next(err);
                    }
                    if (
                        Array.isArray(allowedRoles) &&
                        allowedRoles.includes(payload.token.role)
                    ) {
                        socket.user = payload.token;
                        return next();
                    }
                    err.data = errors.forbiddenAccess.message;
                    next(err);
                } catch (error) {
                    error.data = errors.invalidCredentials.message;
                    next(error);
                }
            }
        };
    }
    return Object.freeze({protectRoute, socketAuthenticator});
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

routeProtector = routeProtectionFactory(Blacklist);

module.exports = Object.freeze({
    allowRoles,
    protectRoute: routeProtector.protectRoute,
    socketAuthenticator: routeProtector.socketAuthenticator
});