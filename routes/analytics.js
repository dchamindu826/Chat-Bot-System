const router = require('express').Router();
const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');
const SystemLog = require('../models/SystemLog');
const Contact = require('../models/Contact');
const { verifyTokenAndAdmin, verifyToken, verifyTokenAndAuthorization } = require('../verifyToken');

// 1. ADMIN OVERVIEW
router.get('/overview', verifyTokenAndAdmin, async (req, res) => {
  try {
    const activeClients = await User.countDocuments({ role: 'user' }); 
    const totalMessages = await Message.countDocuments();
    const totalErrors = await SystemLog.countDocuments({ type: 'ERROR' });

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
        chartData.push({ name: dateString, messages: found ? found.count : 0 });
    }
    
    chartData.sort((a, b) => new Date(a.name) - new Date(b.name));

    res.status(200).json({ totalMessages, activeClients, totalErrors, chartData });
  } catch (err) { res.status(500).json(err); }
});

// 2. ADMIN LOGS (Supabase විදිහට වෙනස් කර ඇත)
router.get('/logs', verifyTokenAndAdmin, async (req, res) => {
  try {
    // Supabase එකේ system_logs table එකක් නැත්නම් Crash නොවී හිස් Array එකක් යවන්න
    const { data: logs, error } = await supabase.from('system_logs')
        .select(`*, clientId:users(id, name, business_name, phone)`)
        .order('created_at', { ascending: false })
        .limit(100);
        
    if (error) {
        return res.status(200).json([]); // Table එක නැත්නම් Error නොදී හිස්ව යවනවා
    }

    const formattedLogs = logs.map(log => ({
        _id: log.id,
        type: log.type,
        source: log.source,
        message: log.message,
        metaData: log.meta_data,
        createdAt: log.created_at,
        clientId: log.clientId ? { 
            _id: log.clientId.id, 
            name: log.clientId.name, 
            businessName: log.clientId.business_name 
        } : null
    }));

    res.status(200).json(formattedLogs);
  } catch (err) { 
      res.status(200).json([]); // 500 error එන එක නවත්වන්න 
  }
});

// 3. USER DASHBOARD STATS
router.get('/user-stats', verifyToken, async (req, res) => {
  try {
    const { phase } = req.query;
    const ownerId = req.user.id;
    let filter = { ownerId: ownerId };
    
    if (phase && phase !== 'All') {
        filter.phase = parseInt(phase);
    }

    const totalCalls = await Contact.countDocuments(filter);
    const totalMessages = await Message.countDocuments({ ownerId: req.user.id });
    const assignedContacts = await Contact.countDocuments({ ...filter, assignedTo: { $ne: null } });
    const answeredContacts = await Contact.countDocuments({ ...filter, callStatus: 'Answered' });
    
    const responseRate = assignedContacts > 0 ? ((answeredContacts / assignedContacts) * 100).toFixed(1) : 0;

    // 🔥 FIX: Sending number only (Percentage handling moved to frontend)
    res.status(200).json({ totalCalls, totalMessages, responseRate });
  } catch (err) { res.status(500).json(err); }
});

// 4. AGENT PERFORMANCE (🔥 FIXED: Logic Updated)
router.get('/agent-performance', verifyToken, async (req, res) => {
  try {
    const { phase } = req.query;
    let matchStage = { ownerId: new mongoose.Types.ObjectId(req.user.id) };

    if (phase && phase !== 'All') {
        matchStage.phase = parseInt(phase);
    }

    const stats = await Contact.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$assignedTo",
          totalAllocated: { $sum: 1 },
          
          // Count 'Answered'
          answered: { $sum: { $cond: [{ $eq: ["$callStatus", "Answered"] }, 1, 0] } },
          
          // 🔥 FIX: Count 'No Answer' IF status is 'No Answer' OR (Status is 'Pending' BUT Attempts > 0)
          // මේකෙන් වෙන්නේ Phase මාරු වෙලා Pending වුනත්, කලින් කෝල් කරලා නිසා ඒක No Answer විදිහට ගණන් ගන්නවා.
          noAnswer: { 
            $sum: { 
                $cond: [
                    { 
                        $or: [
                            { $eq: ["$callStatus", "No Answer"] },
                            { 
                                $and: [
                                    { $eq: ["$callStatus", "Pending"] },
                                    { $gt: [{ $toInt: "$attemptCount" }, 0] } // Check if attempts > 0
                                ] 
                            }
                        ] 
                    }, 
                    1, 
                    0 
                ] 
            } 
          },

          // Count 'Reject'
          reject: { $sum: { $cond: [{ $eq: ["$callStatus", "Reject"] }, 1, 0] } },
          
          // Count 'Pure Pending' (Attempts == 0)
          pending: { 
            $sum: { 
                $cond: [
                    { 
                        $and: [
                            { $eq: ["$callStatus", "Pending"] },
                            { $eq: [{ $toInt: "$attemptCount" }, 0] } // Only count if NO attempts made
                        ] 
                    }, 
                    1, 
                    0 
                ] 
            } 
          }
        }
      },
      {
        $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "agentInfo" }
      },
      { $unwind: { path: "$agentInfo", preserveNullAndEmptyArrays: true } }
    ]);

    const formattedStats = stats.map(stat => {
        const responseRate = stat.totalAllocated > 0 ? ((stat.answered / stat.totalAllocated) * 100).toFixed(1) : 0;
        
        // Auto Calculate 'To Cover' (Assigned - Actions)
        // දැන් No Answer එකට 'Retries' එකතු වුන නිසා, To Cover එකට එන්නේ තාම කෝල් නොකරපු ටික විතරයි.
        const totalActioned = stat.answered + stat.noAnswer + stat.reject;
        const toCover = stat.totalAllocated - totalActioned;

        return {
            id: stat._id,
            agentName: stat.agentInfo ? stat.agentInfo.name : "Unassigned Pool",
            totalAllocated: stat.totalAllocated,
            answered: stat.answered,
            noAnswer: stat.noAnswer,
            reject: stat.reject,
            responseRate: responseRate, // 🔥 FIX: Removed '%' string here
            toCover: toCover < 0 ? 0 : toCover
        };
    });

    res.status(200).json(formattedStats);
  } catch (err) {
    console.error(err);
    res.status(500).json(err);
  }
});

module.exports = router;