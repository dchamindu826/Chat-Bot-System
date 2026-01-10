const router = require('express').Router();
const BotConfig = require('../models/BotConfig');
const { verifyToken } = require('../verifyToken');

// SAVE Bot Config
router.post('/save', verifyToken, async (req, res) => {
  console.log("📥 Bot Config Save Request:", req.body); // Backend Console Log

  const { userId, replies } = req.body;

  // 🛑 Validation: If userId is missing, stop here!
  if (!userId) {
    console.error("❌ Save Failed: userId is missing in payload.");
    return res.status(400).json({ message: "User ID (ownerId) is required!" });
  }

  try {
    let config = await BotConfig.findOne({ ownerId: userId });
    
    if (config) {
      config.replies = replies;
      config = await config.save();
    } else {
      config = new BotConfig({ ownerId: userId, replies });
      await config.save();
    }
    
    console.log("✅ Bot Config Saved for:", userId);
    res.status(200).json(config);

  } catch (err) {
    console.error("❌ Database Error:", err);
    res.status(500).json({ message: "Database Error", error: err.message });
  }
});

// GET Bot Config (Admin View)
router.get('/:userId', async (req, res) => {
  try {
    if (!req.params.userId || req.params.userId === 'undefined') {
        return res.status(400).json({ message: "Invalid User ID provided" });
    }
    const config = await BotConfig.findOne({ ownerId: req.params.userId });
    res.status(200).json(config ? config.replies : []);
  } catch (err) {
    res.status(500).json(err);
  }
});

// GET Bot Config (My Config)
router.get('/my/config', verifyToken, async (req, res) => {
  try {
    const config = await BotConfig.findOne({ ownerId: req.user.id });
    res.status(200).json(config ? config.replies : []);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;