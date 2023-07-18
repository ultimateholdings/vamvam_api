const {jwtWrapper} = require("../utils/helpers");

function sendAuthFaillure(res) {
    res.status(401).json({
        message: "you are not authorized to access this content"
    });
}
async function protectRoute(req, res, next) {
    const [, token] = (req.headers.authorization || "").split(" ");
    const jwtHandler = jwtWrapper();
    let payload;

    if (token == null) {
        sendAuthFaillure(res);
    } else {
        try {
            payload = await jwtHandler.verify(token);
            req.user = payload;
            next();
        } catch (error) {
            sendAuthFaillure(res);
        }
    }
    
}

function verifyValidId(req, res, next) {
    const {id} = req.body;
    if (id === null || id === undefined) {
        res.status(440).json({
            message: "invalid identifier"
        });
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
    protectRoute,
    verifyValidId
});