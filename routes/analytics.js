const router = require('express').Router();
const Message = require('../models/Message');
const User = require('../models/User');
const SystemLog = require('../models/SystemLog');
const { verifyTokenAndAdmin } = require('../verifyToken');

// 1. OVERVIEW STATS
router.get('/overview', verifyTokenAndAdmin, async (req, res) => {
  try {
    const activeClients = await User.countDocuments({ role: 'user' }); 
    const totalMessages = await Message.countDocuments();
    const totalErrors = await SystemLog.countDocuments({ type: 'ERROR' });

    // Last 7 Days Chart Data
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const messageChart = await Message.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const chartData = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateString = d.toISOString().split('T')[0];
        
        const found = messageChart.find(item => item._id === dateString);
        chartData.push({
            name: dateString,
            messages: found ? found.count : 0
        });
    }
    
    chartData.sort((a, b) => new Date(a.name) - new Date(b.name));

    res.status(200).json({
      totalMessages,
      activeClients,
      totalErrors,
      chartData
    });

  } catch (err) {
    res.status(500).json(err);
  }
});

// ✅ 2. GET SYSTEM LOGS (With Client Info)
router.get('/logs', verifyTokenAndAdmin, async (req, res) => {
  try {
    const logs = await SystemLog.find()
      .populate('clientId', 'name businessName phone') // Client Data අදිනවා
      .sort({ createdAt: -1 })
      .limit(100); 

    res.status(200).json(logs);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;