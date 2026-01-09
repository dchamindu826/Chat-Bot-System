const router = require("express").Router();
const User = require("../models/User");
const CryptoJS = require("crypto-js");
const jwt = require("jsonwebtoken");

// 1. REGISTER
router.post("/register", async (req, res) => {
  try {
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) return res.status(400).json({ message: "Email already exists" });

    const encryptedPassword = CryptoJS.AES.encrypt(
      req.body.password,
      process.env.PASS_SEC
    ).toString();

    const newUser = new User({
      name: req.body.name,
      email: req.body.email,
      password: encryptedPassword,
      role: req.body.role || 'user',
      businessName: req.body.businessName || '',
      phone: req.body.phone || ''
    });

    const savedUser = await newUser.save();
    res.status(201).json(savedUser);
  } catch (err) {
    console.error("Register Error:", err);
    res.status(500).json(err);
  }
});

// 2. LOGIN (Debug Version)
router.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    
    if (!user) {
      return res.status(401).json({ message: "User not found!" });
    }

    // --- DECRYPTION CHECK START ---
    let originalPassword;
    try {
        const hashedPassword = CryptoJS.AES.decrypt(
          user.password, 
          process.env.PASS_SEC
        );
        originalPassword = hashedPassword.toString(CryptoJS.enc.Utf8);
    } catch (decryptErr) {
        console.error("Decryption Failed! Key mismatch potentially.");
        return res.status(500).json({ message: "Password Error: Database keys mismatch. Please reset user." });
    }

    // Check if password is empty (Common issue if keys don't match)
    if (!originalPassword) {
        return res.status(500).json({ message: "Login Failed: Invalid Password Data in DB (Key Mismatch)" });
    }
    // --- DECRYPTION CHECK END ---

    if (originalPassword !== req.body.password) {
      return res.status(401).json({ message: "Wrong Password!" });
    }

    const accessToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SEC,
      { expiresIn: "3d" }
    );

    const { password, ...others } = user._doc;
    res.status(200).json({ ...others, accessToken });

  } catch (err) {
    console.error("Login Critical Error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

module.exports = router;