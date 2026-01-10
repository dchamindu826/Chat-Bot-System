const router = require("express").Router();
const User = require("../models/User");
const CryptoJS = require("crypto-js");
const jwt = require("jsonwebtoken");

// REGISTER
router.post("/register", async (req, res) => {
  try {
    // Check if user exists
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) return res.status(400).json({ message: "Email already exists" });

    const newUser = new User({
      name: req.body.name,
      email: req.body.email,
      password: CryptoJS.AES.encrypt(req.body.password, process.env.PASS_SEC).toString(),
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

// LOGIN (Updated with Better Error Handling)
router.post("/login", async (req, res) => {
  try {
    // 1. User ඉන්නවද බලන්න
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(401).json({ message: "Wrong Credentials!" });
    }

    // 2. Password Decrypt කරන්න (Try-Catch දාලා ආරක්ෂා කරමු)
    let originalPassword;
    try {
        const hashedPassword = CryptoJS.AES.decrypt(user.password, process.env.PASS_SEC);
        originalPassword = hashedPassword.toString(CryptoJS.enc.Utf8);
    } catch (cryptoError) {
        console.error("Decryption Error:", cryptoError);
        return res.status(500).json({ message: "Password processing error. Check PASS_SEC in .env" });
    }

    // 3. Password හරිද බලන්න
    if (originalPassword !== req.body.password) {
      return res.status(401).json({ message: "Wrong Credentials!" });
    }

    // 4. Token එක හදන්න
    const accessToken = jwt.sign(
      {
        id: user._id,
        role: user.role, // role එකත් token එකට දානවා
      },
      process.env.JWT_SEC,
      { expiresIn: "3d" }
    );

    // Password එක අයින් කරලා අනිත් ටික යවන්න
    const { password, ...others } = user._doc;
    res.status(200).json({ ...others, accessToken });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ message: "Internal Server Error", error: err.message });
  }
});

module.exports = router;