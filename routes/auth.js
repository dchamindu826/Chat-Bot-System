const router = require("express").Router();
const User = require("../models/User");
const CryptoJS = require("crypto-js");
const jwt = require("jsonwebtoken");

// 1. REGISTER
router.post("/register", async (req, res) => {
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) return res.status(400).json("Email already exists");

    const encryptedPassword = CryptoJS.AES.encrypt(
      req.body.password,
      process.env.PASS_SEC // .env eken gannawa
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

// 2. LOGIN
router.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    
    if (!user) {
      return res.status(401).json({ message: "User not found!" });
    }

    const hashedPassword = CryptoJS.AES.decrypt(
      user.password, 
      process.env.PASS_SEC // .env eken gannawa
    );
    
    const originalPassword = hashedPassword.toString(CryptoJS.enc.Utf8);

    if (originalPassword !== req.body.password) {
      return res.status(401).json({ message: "Wrong Password!" });
    }

    const accessToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SEC, // .env eken gannawa
      { expiresIn: "3d" }
    );

    const { password, ...others } = user._doc;
    res.status(200).json({ ...others, accessToken });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json(err);
  }
});

module.exports = router;