const router = require("express").Router();
const User = require("../models/User");
const CryptoJS = require("crypto-js");
const jwt = require("jsonwebtoken");

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const role = req.body.role || 'user';
    
    // Encrypt Password
    const encryptedPassword = CryptoJS.AES.encrypt(
      req.body.password,
      process.env.PASS_SEC
    ).toString();

    const newUser = new User({
      username: req.body.username,
      email: req.body.email,
      password: encryptedPassword,
      role: role
    });

    const savedUser = await newUser.save();
    res.status(201).json(savedUser);
  } catch (err) {
    console.error("Register Error:", err);
    res.status(500).json(err);
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    
    if (!user) {
      return res.status(401).json({ message: "User not found!" });
    }

    // Decrypt Password
    const hashedPassword = CryptoJS.AES.decrypt(user.password, process.env.PASS_SEC);
    const originalPassword = hashedPassword.toString(CryptoJS.enc.Utf8);

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
    console.error("Login Error:", err); // Vercel Logs වල බලාගන්න පුළුවන්
    res.status(500).json({ message: "Internal Server Error", error: err.message });
  }
});

module.exports = router;