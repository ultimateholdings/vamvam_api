const buildAuthRoutes = require("./auth.route");
const buildUserRoutes = require("./user.route");
const {Router} = require("express");

function buildRoutes({
    authRoutes,
    userRoutes
}) {
    const authRouter = authRoutes || buildAuthRoutes();
    const userRouter = userRoutes || buildUserRoutes();
    const router = Router();
    router.use("/auth", authRouter);
    router.use("/user", userRouter);
    return router;
}

module.exports = buildRoutes;
