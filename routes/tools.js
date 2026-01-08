const router = require('express').Router();
const Broadcast = require('../models/Broadcast');
const Contact = require('../models/Contact');
const { verifyToken } = require('../verifyToken');

// 1. CREATE BROADCAST
router.post('/broadcast/create', verifyToken, async (req, res) => {
  try {
    const newBroadcast = new Broadcast({
        ownerId: req.user.id,
        message: req.body.message,
        recipients: req.body.recipients,
        scheduledTime: req.body.scheduledTime
    });
    const saved = await newBroadcast.save();
    res.status(200).json(saved);
  } catch (err) { res.status(500).json(err); }
});

// 2. GET BROADCAST HISTORY
router.get('/broadcast/history', verifyToken, async (req, res) => {
  try {
    const history = await Broadcast.find({ ownerId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json(history);
  } catch (err) { res.status(500).json(err); }
});

// 3. COMMUNITY GAP ANALYSIS (Logic Only)
// Note: WhatsApp API එකෙන් Community List එක ගන්න බැරි නම්, අපි CSV Upload එකක් වගේ හිතමු.
router.post('/community/analyze', verifyToken, async (req, res) => {
  try {
    const { communityNumbers } = req.body; // Array of numbers in community
    const myContacts = await Contact.find({ ownerId: req.user.id }).select('phoneNumber name');
    
    // අපේ Database එකේ ඉන්න, හැබැයි Community එකේ නැති අය හොයනවා
    const missingInCommunity = myContacts.filter(c => !communityNumbers.includes(c.phoneNumber));
    
    res.status(200).json(missingInCommunity);
  } catch (err) { res.status(500).json(err); }
});

module.exports = router;