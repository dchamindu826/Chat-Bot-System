const router = require('express').Router();
const BotConfig = require('../models/BotConfig');
const { verifyToken } = require('../verifyToken');

// 1. SAVE Bot Config (Fixed for ID & Active Status)
router.post('/save', verifyToken, async (req, res) => {
  console.log("📥 Bot Config Save Request:", req.body);

  // 🔥 Fix 1: Frontend එකෙන් එන ownerId හෝ userId දෙකෙන් ඕන එකක් ගන්නවා
  const targetId = req.body.ownerId || req.body.userId; 
  const { replies, isActive } = req.body;

  // Validation
  if (!targetId) {
    console.error("❌ Save Failed: Target ID is missing.");
    return res.status(400).json({ message: "User ID is required!" });
  }

  try {
    // 🔥 Fix 2: findOneAndUpdate පාවිච්චි කිරීම (Duplicate Error එන්නේ නෑ)
    const config = await BotConfig.findOneAndUpdate(
      { $or: [{ ownerId: targetId }, { userId: targetId }] }, // ID දෙකෙන් ඕන එකක් තිබ්බොත් අල්ලනවා
      { 
        $set: {
          ownerId: targetId,
          userId: targetId, // ⚠️ userId එකත් අනිවාර්යයෙන් Update කරනවා (Null වෙන්න දෙන්නේ නෑ)
          replies: replies,
          isActive: isActive // 🔥 Fix 3: ON/OFF status එකත් save කරනවා
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true } // නැත්නම් අලුතින් හදනවා
    );
    
    console.log("✅ Bot Config Saved Successfully for:", targetId);
    res.status(200).json(config);

  } catch (err) {
    console.error("❌ Database Error:", err);
    res.status(500).json({ message: "Database Error", error: err.message });
  }
});

// 2. GET Bot Config (Admin View)
router.get('/:userId', async (req, res) => {
  try {
    if (!req.params.userId || req.params.userId === 'undefined') {
        return res.status(400).json({ message: "Invalid User ID" });
    }
    
    const config = await BotConfig.findOne({ 
        $or: [ { ownerId: req.params.userId }, { userId: req.params.userId } ]
    });
    
    // Config නැත්නම් Default හිස් එකක් යවනවා (Frontend එක කැඩෙන්නේ නැති වෙන්න)
    res.status(200).json(config ? config : { replies: [], isActive: true });
  } catch (err) {
    res.status(500).json(err);
  }
});

// 3. GET Bot Config (My Config - For Users)
router.get('/my/config', verifyToken, async (req, res) => {
  try {
    const config = await BotConfig.findOne({ 
        $or: [ { ownerId: req.user.id }, { userId: req.user.id } ]
    });
    res.status(200).json(config ? config : { replies: [], isActive: true });
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;