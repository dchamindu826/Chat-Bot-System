// crm-backend/routes/bot.js
const router = require('express').Router();
const BotConfig = require('../models/BotConfig');
const { verifyTokenAndAdmin } = require('../verifyToken');

// 1. SAVE or UPDATE Bot Config
router.post('/save', verifyTokenAndAdmin, async (req, res) => {
  const { userId, replies } = req.body;

  try {
    let config = await BotConfig.findOne({ userId });

    if (config) {
      // දැනටමත් තියෙනවා නම් Update කරනවා
      config.replies = replies;
      config = await config.save();
    } else {
      // නැත්නම් අලුතින් හදනවා
      config = new BotConfig({ userId, replies });
      await config.save();
    }

    res.status(200).json(config);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 2. GET Bot Config (Load කරන්න)
router.get('/:userId', verifyTokenAndAdmin, async (req, res) => {
  try {
    const config = await BotConfig.findOne({ userId: req.params.userId });
    res.status(200).json(config ? config.replies : []);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;