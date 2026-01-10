const router = require("express").Router();
const User = require("../models/User");
const CryptoJS = require("crypto-js");
const { verifyToken } = require("../verifyToken");

// 1. ADD NEW AGENT (Frontend calls: /api/team/add-agent)
router.post("/add-agent", verifyToken, async (req, res) => {
  try {
    const ownerId = req.user.id;
    
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) return res.status(400).json({ message: "Email already exists!" });

    const newAgent = new User({
      name: req.body.name,
      email: req.body.email,
      password: CryptoJS.AES.encrypt(req.body.password, process.env.PASS_SEC).toString(),
      role: "agent",
      phone: req.body.phone,
      businessName: req.user.businessName || "Agent",
      ownerId: ownerId,
    });

    const savedAgent = await newAgent.save();
    const { password, ...others } = savedAgent._doc;
    res.status(201).json(others);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 2. GET AGENTS (Frontend calls: /api/team/agents)
router.get("/agents", verifyToken, async (req, res) => {
  try {
    const agents = await User.find({ ownerId: req.user.id });
    res.status(200).json(agents);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;