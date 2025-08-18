const express = require('express');
const router = express.Router();
const passport = require('passport');
const ActivityLog = require('../models/ActivityLog');

/**
 * @swagger
 * /activity/{id}:
 *   get:
 *     summary: Get activity logs for a document
 *     tags: [Activity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action (e.g., create, update, delete, share_editor, share_viewer)
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs before this date
 *     responses:
 *       200:
 *         description: List of activity logs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   docId:
 *                     type: string
 *                   userId:
 *                     type: object
 *                     properties:
 *                       username:
 *                         type: string
 *                   action:
 *                     type: string
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *       500:
 *         description: Server error
 */
router.get('/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const { id } = req.params;
    const { action, startDate, endDate } = req.query;
    const query = { docId: id };
    if (action) query.action = action;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    const logs = await ActivityLog.find(query)
      .populate('userId', 'username')
      .sort({ timestamp: -1 });
    res.status(200).json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching activity logs' });
  }
});

module.exports = router;
