const router = require('express').Router();
const Message = require('../models/Message');
const mongoose = require('mongoose');
const { verifyToken } = require('../verifyToken');

// 1. Get Conversation List (Chat කරපු Customer ලාගේ ලිස්ට් එක)
router.get('/conversations/:userId', verifyToken, async (req, res) => {
    try {
        const conversations = await Message.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(req.params.userId) } },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: "$customerPhone", // Phone number එකෙන් group කරනවා
                    lastMessage: { $first: "$content" }, // අන්තිම මැසේජ් එක
                    lastActive: { $first: "$createdAt" },
                    type: { $first: "$type" }
                }
            },
            { $sort: { lastActive: -1 } }
        ]);
        res.status(200).json(conversations);
    } catch (err) {
        res.status(500).json(err);
    }
});

// 2. Get Chat History (Customers කෙනෙක් එක්ක කරපු Chat එක)
router.get('/:userId/:phone', verifyToken, async (req, res) => {
    try {
        const messages = await Message.find({
            userId: req.params.userId,
            customerPhone: req.params.phone
        }).sort({ createdAt: 1 }); // පරණ ඒවා උඩට, අලුත් ඒවා යටට
        res.status(200).json(messages);
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;