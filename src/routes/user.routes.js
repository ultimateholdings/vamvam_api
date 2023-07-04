const express = require('express');
const router = express.Router();
const { userCtrl } = require('../controllers/index');
const { uploadSingleImage } = require("../utils/upload");

router.post('/', userCtrl.createUser);
router.get('/:userId', userCtrl.findUserByPk);
router.put('/:userId', uploadSingleImage("avatar"), userCtrl.updateUserProfile);
router.put('/avatar/:userId', uploadSingleImage("avatar"), userCtrl.updateAvatar);
router.put('/phone/:userId', userCtrl.updatePhoneNumber);
router.delete('/avatar/:userId', userCtrl.deleteAvatar);
router.delete('/:userId', userCtrl.deleteUser);

module.exports = router;