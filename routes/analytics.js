const router = require('express').Router();
const Message = require('../models/Message');
const User = require('../models/User');
const SystemLog = require('../models/SystemLog');
const { verifyTokenAndAdmin } = require('../verifyToken');

router.get('/overview', verifyTokenAndAdmin, async (req, res) => {
  try {
    // 1. Total Stats
    // Active Clients: role='user' හෝ 'admin' ඕනම කෙනෙක් ගමු දැනට Test කරන්න
    const activeClients = await User.countDocuments({ }); 
    const totalMessages = await Message.countDocuments();
    const totalErrors = await SystemLog.countDocuments({ type: 'ERROR' });

    // 2. Chart Data (Last 7 Days)
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

    // Fill missing dates with 0 (Chart එක ලස්සනට පේන්න)
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
    
    // Sort by date ascending
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

module.exports = router;