const router = require('express').Router();
const SystemLog = require('../models/SystemLog');
const { verifyTokenAndAdmin } = require('../verifyToken');

// අන්තිමට වුන Errors/Logs 100 Frontend එකට යවන Route එක
router.get('/', verifyTokenAndAdmin, async (req, res) => {
    try {
        const logs = await SystemLog.find().sort({ createdAt: -1 }).limit(100);
        res.status(200).json(logs);
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;