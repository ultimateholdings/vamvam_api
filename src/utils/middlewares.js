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

module.exports = Object.freeze({
    protectRoute
});