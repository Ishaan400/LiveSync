const ActivityLog = require('../models/ActivityLog');

const getActivityLogs = async (req, res) => {
  const { id } = req.params;
  try {
    const logs = await ActivityLog.find({ docId: id })
      .populate('userId', 'username')
      .sort({ timestamp: -1 });
    res.status(200).json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching activity logs' });
  }
};

module.exports = { getActivityLogs };
