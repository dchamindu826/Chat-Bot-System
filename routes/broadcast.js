const router = require("express").Router();
const Broadcast = require("../models/Broadcast");
const { verifyToken } = require("../verifyToken");

// 1. CREATE NEW BROADCAST
router.post("/create", verifyToken, async (req, res) => {
  try {
    const { name, recipients, message, mediaUrl, messageType, scheduledTime } = req.body;

    const newBroadcast = new Broadcast({
      ownerId: req.user.id,
      name,
      recipients, // Array of numbers ['947...', '947...']
      message,
      mediaUrl,
      messageType, 
      scheduledTime: new Date(scheduledTime), 
      status: "pending"
    });

    const savedJob = await newBroadcast.save();
    res.status(201).json(savedJob);

  } catch (err) {
    res.status(500).json(err);
  }
});

// 2. GET MY BROADCAST HISTORY
router.get("/", verifyToken, async (req, res) => {
    try {
        const list = await Broadcast.find({ ownerId: req.user.id }).sort({ createdAt: -1 });
        res.status(200).json(list);
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;