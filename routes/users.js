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

// GHOST LOGIN ROUTE (Super Admin Only)
router.post('/ghost-login/:id', verifyTokenAndAdmin, async (req, res) => {
  try {
    // 1. Admin ට ඕන කරන User ව හොයාගන්නවා
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json("User not found!");

    // 2. ඒ User වෙනුවෙන් අලුත් Token එකක් Sign කරනවා (Password ඕන නෑ)
    const accessToken = jwt.sign(
      { id: user._id, role: user.role }, // User ගේ ID සහ Role එක දානවා
      process.env.JWT_SECRET,
      { expiresIn: "3d" }
    );

    // 3. User ගේ විස්තර සහ Token එක Admin ට යවනවා
    const { password, ...others } = user._doc;
    res.status(200).json({ ...others, accessToken });

  } catch (err) {
    res.status(500).json(err);
  }
});

const SystemLog = require('../models/SystemLog');

// Get All System Logs (Admin Only)
router.get('/logs', verifyTokenAndAdmin, async (req, res) => {
    try {
        const logs = await SystemLog.find().sort({ createdAt: -1 }).limit(50); // අන්තිම 50 විතරයි ගන්නේ
        res.status(200).json(logs);
    } catch (err) {
        res.status(500).json(err);
    }
});


module.exports = router;