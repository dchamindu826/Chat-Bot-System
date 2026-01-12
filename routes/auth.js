const router = require("express").Router();
const User = require("../models/User");
const CryptoJS = require("crypto-js");
const jwt = require("jsonwebtoken");
const { verifyToken } = require("../verifyToken"); // 🔥 MEKA ALUTHEN EKATHU KALA

// 1. REGISTER
router.post("/register", async (req, res) => {
  try {
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
    res.status(500).json(err);
  }
});

// 2. LOGIN
router.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(401).json({ message: "Wrong Credentials!" });

    const hashedPassword = CryptoJS.AES.decrypt(user.password, process.env.PASS_SEC);
    const originalPassword = hashedPassword.toString(CryptoJS.enc.Utf8);

    if (originalPassword !== req.body.password) {
      return res.status(401).json({ message: "Wrong Credentials!" });
    }

    const accessToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SEC,
      { expiresIn: "3d" }
    );

    const { password, ...others } = user._doc;
    res.status(200).json({ ...others, accessToken });

  } catch (err) {
    res.status(500).json({ message: "Internal Server Error", error: err.message });
  }
});

// 🔥 3. GHOST LOGIN (NEW ROUTE)
// Admin ට විතරයි මේක කරන්න පුළුවන්
router.post("/ghost-login/:id", verifyToken, async (req, res) => {
    try {
        // 1. Check if the requester is an Admin
        // ඔයාගේ verifyToken එකේ user role එක set වෙනවා නම් මේක වැඩ.
        // නැත්නම් ඔයාට DB එකෙන් check කරන්න වෙනවා.
        // දැනට අපි උපකල්පනය කරමු verifyToken එකෙන් එන user admin කියලා.
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: "Access Denied. Admins only." });
        }

        // 2. Find the target User (Client)
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ message: "User not found" });

        // 3. Generate a NEW Token for THAT User
        const ghostToken = jwt.sign(
            { 
                id: targetUser._id, 
                role: targetUser.role,
                businessName: targetUser.businessName 
            },
            process.env.JWT_SEC,
            { expiresIn: "1d" } // දවසකට විතරක් valid වෙන token එකක්
        );

        // 4. Return the Token
        res.status(200).json({ 
            message: "Ghost Access Granted", 
            token: ghostToken,
            user: {
                id: targetUser._id,
                name: targetUser.name,
                role: targetUser.role
            }
        });

    } catch (err) {
        console.error("Ghost Login Error:", err);
        res.status(500).json(err);
    }
});

module.exports = router;