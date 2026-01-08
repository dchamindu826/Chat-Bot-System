const router = require('express').Router();
const User = require('../models/User');
const BotConfig = require('../models/BotConfig');
const SystemLog = require('../models/SystemLog');
const { verifyTokenAndAdmin } = require('../verifyToken');
const CryptoJS = require("crypto-js");
const jwt = require("jsonwebtoken");

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

// 2. CREATE CLIENT (Updated to save WhatsApp Config)
router.post('/client', verifyTokenAndAdmin, async (req, res) => {
    try {
        const encryptedPassword = CryptoJS.AES.encrypt(
          req.body.password,
          process.env.PASS_SEC
        ).toString();

        const newUser = new User({
            name: req.body.name,
            email: req.body.email,
            password: encryptedPassword,
            role: 'user',
            businessName: req.body.businessName,
            phone: req.body.phone,
            status: 'active',
            
            // ✅ MEKA ADD KALA: Aluth client kenek hadaddima API keys save wenna
            whatsappConfig: req.body.whatsappConfig 
        });
        
        const savedUser = await newUser.save();
        res.status(200).json(savedUser);
    } catch (err) {
        res.status(500).json(err);
    }
});

// 3. UPDATE CLIENT (Already correct, but good to double check)
router.put('/client/:id', verifyTokenAndAdmin, async (req, res) => {
  try {
    if (req.body.password) {
      req.body.password = CryptoJS.AES.encrypt(
        req.body.password,
        process.env.PASS_SEC
      ).toString();
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { 
        $set: req.body // Meken whatsappConfig ekath auto update wenawa
      },
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
    await BotConfig.findOneAndDelete({ userId: req.params.id });
    res.status(200).json("Client has been deleted...");
  } catch (err) {
    res.status(500).json(err);
  }
});

// 5. GHOST LOGIN ROUTE
router.post('/ghost-login/:id', verifyTokenAndAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json("User not found!");

    const accessToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SEC,
      { expiresIn: "3d" }
    );

    const { password, ...others } = user._doc;
    res.status(200).json({ ...others, accessToken });

  } catch (err) {
    res.status(500).json(err);
  }
});

// 6. GET ALL USERS
router.get("/", verifyTokenAndAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ _id: -1 });
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 7. DELETE USER
router.delete("/:id", verifyTokenAndAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.status(200).json("User has been deleted...");
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;