const router = require("express").Router();
const User = require("../models/User");
const CryptoJS = require("crypto-js");
const { verifyToken } = require("../verifyToken");

// 1. ADD NEW AGENT (Client can add agents)
router.post("/add", verifyToken, async (req, res) => {
  try {
    // Agent ගේ Boss (Client) ගේ ID එක
    const ownerId = req.user.id;

    // Email එක දැනටමත් තියෙනවද බලනවා
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) return res.status(400).json({ message: "Email already exists!" });

    const newAgent = new User({
      name: req.body.name,
      email: req.body.email,
      password: CryptoJS.AES.encrypt(req.body.password, process.env.PASS_SEC).toString(),
      role: "agent", // Role එක Agent
      phone: req.body.phone,
      businessName: req.user.businessName || "Agent", // Boss ගේ Business Name එකම දාමු
      ownerId: ownerId, // මේ Agent අයිති කාටද කියලා
    });

    const savedAgent = await newAgent.save();
    
    // Password එක අයින් කරලා එවන්න
    const { password, ...others } = savedAgent._doc;
    res.status(201).json(others);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 2. GET MY AGENTS
router.get("/", verifyToken, async (req, res) => {
  try {
    // මගේ යටතේ ඉන්න (ownerId එක මගේ වුන) agents ලා ටික ගන්න
    const agents = await User.find({ ownerId: req.user.id });
    res.status(200).json(agents);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;