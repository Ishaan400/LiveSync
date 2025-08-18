const express = require('express');
const passport = require('passport');
const { getAllUsers } = require('../controllers/userController');

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   username:
 *                     type: string
 *       500:
 *         description: Server error
 */
const router = express.Router();

router.get('/', passport.authenticate('jwt', { session: false }), getAllUsers);

module.exports = router;