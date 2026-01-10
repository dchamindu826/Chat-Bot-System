const router = require('express').Router();
const BotConfig = require('../models/BotConfig');
const { verifyToken } = require('../verifyToken');

// SAVE Bot Config
router.post('/save', verifyToken, async (req, res) => {
  console.log("📥 Bot Config Save Request:", req.body);

  const { userId, replies } = req.body;

  // 1. Validation
  if (!userId) {
    console.error("❌ Save Failed: userId is missing.");
    return res.status(400).json({ message: "User ID is required!" });
  }

  try {
    // 2. Smart Save (Upsert)
    // මේකෙන් කරන්නේ: Record එක තියෙනවා නම් Update කරනවා, නැත්නම් අලුතෙන් හදනවා.
    // වැදගත්ම දේ: අපි ownerId සහ userId කියන ෆීල්ඩ් දෙකටම ID එක දානවා.
    // එතකොට අර "userId: null" කියන error එක එන්නේ නෑ.
    
    const config = await BotConfig.findOneAndUpdate(
      { ownerId: userId }, // හොයන ෆීල්ඩ් එක
      { 
        $set: {
          ownerId: userId,
          userId: userId, // ⚠️ මේක දැම්මාම අර Index Error එක විසඳෙනවා
          replies: replies
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true } // Options
    );
    
    console.log("✅ Bot Config Saved Successfully for:", userId);
    res.status(200).json(config);

  } catch (err) {
    console.error("❌ Database Error:", err);
    
    // Duplicate Error එකක් ආවොත් User ට තේරෙන විදියට කියමු
    if (err.code === 11000) {
        return res.status(400).json({ message: "Configuration already exists. Please try again or clear database." });
    }
    
    res.status(500).json({ message: "Database Error", error: err.message });
  }
});

// GET Bot Config (Admin View)
router.get('/:userId', async (req, res) => {
  try {
    if (!req.params.userId || req.params.userId === 'undefined') {
        return res.status(400).json({ message: "Invalid User ID" });
    }
    // ownerId හෝ userId දෙකෙන් ඕන එකකින් හොයන්න පුළුවන් විදියට
    const config = await BotConfig.findOne({ 
        $or: [ { ownerId: req.params.userId }, { userId: req.params.userId } ]
    });
    
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