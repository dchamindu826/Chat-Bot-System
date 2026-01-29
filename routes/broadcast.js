const router = require("express").Router();
const Broadcast = require("../models/Broadcast");
const { verifyToken } = require("../verifyToken");

// 1. CREATE BROADCAST CAMPAIGN
router.post("/create", verifyToken, async (req, res) => {
  try {
    const { 
        name, 
        recipients, 
        scheduledTime, 
        isTemplate, 
        messageType, 
        message, 
        mediaUrl, 
        templateName, 
        templateLanguage, 
        templateVariables 
    } = req.body;

    // Validation
    if (!name || !recipients || recipients.length === 0 || !scheduledTime) {
        return res.status(400).json({ message: "Missing required fields (Name, Recipients, Time)." });
    }

    if (isTemplate) {
        if (!templateName || !templateLanguage) {
            return res.status(400).json({ message: "Template Name and Language are required for templates." });
        }
    } else {
        // Custom message validation
        if (!message && !mediaUrl) {
            return res.status(400).json({ message: "Message text or media is required for custom campaigns." });
        }
    }

    // Create new Broadcast Entry
    const newBroadcast = new Broadcast({
      ownerId: req.user.id,
      name,
      recipients,
      scheduledTime,
      isTemplate,
      messageType,
      message: isTemplate ? "" : message, // Template නම් message එක හිස්
      mediaUrl,
      templateName,
      templateLanguage,
      templateVariables: Array.isArray(templateVariables) ? templateVariables : []
    });

    const savedBroadcast = await newBroadcast.save();
    
    res.status(201).json(savedBroadcast);

  } catch (err) {
    console.error("Broadcast Create Error:", err);
    res.status(500).json({ message: "Internal Server Error", error: err.message });
  }
});

// 2. GET ALL BROADCASTS (HISTORY)
router.get("/", verifyToken, async (req, res) => {
    try {
        const broadcasts = await Broadcast.find({ ownerId: req.user.id }).sort({ createdAt: -1 });
        res.status(200).json(broadcasts);
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;