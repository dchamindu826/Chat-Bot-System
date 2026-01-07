// crm-backend/routes/users.js
const router = require('express').Router();
const User = require('../models/User');
const BotConfig = require('../models/BotConfig'); // Delete කරනකොට Bot Data ත් මකන්න ඕන
const { verifyTokenAndAdmin } = require('../verifyToken');
const bcrypt = require('bcryptjs');

// 1. GET ALL CLIENTS
router.get('/clients', verifyTokenAndAdmin, async (req, res) => {
  try {
    const clients = await User.find({ role: 'user' }).sort({ createdAt: -1 });
    const clientsData = clients.map(client => {
      const { password, ...others } = client._doc;
      return others;
    });
    res.status(200).json(clientsData);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 2. CREATE CLIENT
router.post('/client', verifyTokenAndAdmin, async (req, res) => {
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(req.body.password, salt);
        const newUser = new User({
            name: req.body.name,
            email: req.body.email,
            password: hashedPassword,
            role: 'user',
            businessName: req.body.businessName,
            phone: req.body.phone,
            status: 'active'
        });
        const savedUser = await newUser.save();
        res.status(200).json(savedUser);
    } catch (err) {
        res.status(500).json(err);
    }
});

// 3. UPDATE CLIENT (Edit Details & Active/Inactive)
router.put('/client/:id', verifyTokenAndAdmin, async (req, res) => {
  try {
    // Password එක වෙනස් කරනවා නම් විතරක් Hash කරන්න
    if (req.body.password) {
      const salt = await bcrypt.genSalt(10);
      req.body.password = await bcrypt.hash(req.body.password, salt);
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    res.status(200).json(updatedUser);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 4. DELETE CLIENT
router.delete('/client/:id', verifyTokenAndAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    // User ව මැකුවම එයාගේ Bot Settings ටිකත් මකන්න ඕන
    await BotConfig.findOneAndDelete({ userId: req.params.id });
    res.status(200).json("Client has been deleted...");
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;