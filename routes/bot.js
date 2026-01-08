const router = require('express').Router();
const BotConfig = require('../models/BotConfig');
const { verifyTokenAndAdmin, verifyToken } = require('../verifyToken');

// ==========================================
// 🛡️ ADMIN ROUTES (Bot Builder)
// ==========================================

// 1. SAVE Bot Config
router.post('/save', verifyTokenAndAdmin, async (req, res) => {
  const { userId, replies } = req.body;
  try {
    let config = await BotConfig.findOne({ ownerId: userId });
    if (config) {
      config.replies = replies;
      config = await config.save();
    } else {
      config = new BotConfig({ ownerId: userId, replies });
      await config.save();
    }
    res.status(200).json(config);
  } catch (err) { res.status(500).json(err); }
});

// 2. GET Bot Config (Admin Panel Fix)
// ⚠️ කලින් මෙතන තිබුණේ '/admin/:userId' කියලා. ඒකයි 404 ආවේ.
// දැන් අපි ඒක Frontend එක ඉල්ලන විදියටම '/:userId' කළා.
router.get('/:userId', verifyTokenAndAdmin, async (req, res) => {
  try {
    const config = await BotConfig.findOne({ ownerId: req.params.userId });
    res.status(200).json(config ? config.replies : []);
  } catch (err) { res.status(500).json(err); }
});

// ==========================================
// 👤 USER ROUTES (Client Dashboard)
// ==========================================

// 3. GET MY BOT CONFIG (User Only)
router.get('/my/config', verifyToken, async (req, res) => {
  try {
    const config = await BotConfig.findOne({ ownerId: req.user.id });
    // Bot Status එකත් එක්කම යවනවා
    res.status(200).json({ 
        replies: config ? config.replies : [],
        isActive: config ? config.isActive : true 
    });
  } catch (err) { res.status(500).json(err); }
});

// 4. TOGGLE BOT STATUS (ON/OFF Switch)
router.put('/my/status', verifyToken, async (req, res) => {
  try {
    let config = await BotConfig.findOne({ ownerId: req.user.id });
    if (!config) {
        config = new BotConfig({ ownerId: req.user.id, replies: [], isActive: req.body.isActive });
    } else {
        config.isActive = req.body.isActive;
    }
    await config.save();
    res.status(200).json(config);
  } catch (err) { res.status(500).json(err); }
});

module.exports = router;