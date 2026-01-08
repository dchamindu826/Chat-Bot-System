const router = require('express').Router();
const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');
const SystemLog = require('../models/SystemLog');
const Contact = require('../models/Contact');
const { verifyTokenAndAdmin, verifyToken } = require('../verifyToken');

// ==========================================
// 🛡️ ADMIN PANEL ROUTES (Super Admin Only)
// ==========================================

// 1. ADMIN OVERVIEW (Dashboard Cards & Charts)
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

// 2. ADMIN SYSTEM LOGS (Log Table)
router.get('/logs', verifyTokenAndAdmin, async (req, res) => {
  try {
    const logs = await SystemLog.find()
      .populate('clientId', 'name businessName phone')
      .sort({ createdAt: -1 })
      .limit(100); 

    res.status(200).json(logs);
  } catch (err) {
    res.status(500).json(err);
  }
});

// ==========================================
// 👤 USER DASHBOARD ROUTES (Client & Agents)
// ==========================================

// 3. USER DASHBOARD CARDS (User Only)
router.get('/user-stats', verifyToken, async (req, res) => {
  try {
    const totalCalls = await Contact.countDocuments({ ownerId: req.user.id });
    const totalMessages = await Message.countDocuments({ ownerId: req.user.id });
    
    // Response Rate Calculation
    const assignedContacts = await Contact.countDocuments({ ownerId: req.user.id, assignedTo: { $ne: null } });
    const answeredContacts = await Contact.countDocuments({ ownerId: req.user.id, callStatus: 'Answered' });
    const responseRate = assignedContacts > 0 ? ((answeredContacts / assignedContacts) * 100).toFixed(1) : 0;

    res.status(200).json({ totalCalls, totalMessages, responseRate });
  } catch (err) { res.status(500).json(err); }
});

// 4. AGENT PERFORMANCE REPORT (User Dashboard Table)
router.get('/agent-performance', verifyToken, async (req, res) => {
  try {
    const stats = await Contact.aggregate([
      { $match: { ownerId: new mongoose.Types.ObjectId(req.user.id) } },
      {
        $group: {
          _id: "$assignedTo",
          totalAllocated: { $sum: 1 },
          answered: { $sum: { $cond: [{ $eq: ["$callStatus", "Answered"] }, 1, 0] } },
          noAnswer: { $sum: { $cond: [{ $eq: ["$callStatus", "No Answer"] }, 1, 0] } },
          reject: { $sum: { $cond: [{ $eq: ["$callStatus", "Reject"] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ["$callStatus", "Pending"] }, 1, 0] } }
        }
      },
      {
        $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "agentInfo" }
      },
      { $unwind: { path: "$agentInfo", preserveNullAndEmptyArrays: true } }
    ]);

    const formattedStats = stats.map(stat => {
        const responseRate = stat.totalAllocated > 0 
            ? ((stat.answered / stat.totalAllocated) * 100).toFixed(1) 
            : 0;

        return {
            id: stat._id,
            agentName: stat.agentInfo ? stat.agentInfo.name : "Unassigned Pool",
            totalAllocated: stat.totalAllocated,
            answered: stat.answered,
            noAnswer: stat.noAnswer,
            reject: stat.reject,
            responseRate: responseRate + '%',
            toCover: stat.pending
        };
    });

    res.status(200).json(formattedStats);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;