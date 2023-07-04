const buildAuthRoutes = require("./auth.route");
const {Router} = require("express");

function buildRoutes({
    authRoutes = buildAuthRoutes()
}) {
    const router = Router();
    router.use("/auth", authRoutes)
    return router;
}

module.exports = buildRoutes;