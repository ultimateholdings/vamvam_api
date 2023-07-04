const express = require("express");
const router = express.Router();
const usreRoute = require('./user.routes');

const defaultRoutes = [
    {
        path: '/users',
        route: usreRoute
    }
];

defaultRoutes.forEach((route) => {
    router.use(route.path, route.route);
});
  
module.exports = router;