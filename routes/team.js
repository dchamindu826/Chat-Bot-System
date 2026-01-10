// routes/team.js
const router = require("express").Router();
const User = require("../models/User");
const CryptoJS = require("crypto-js");
const { verifyToken } = require("../verifyToken");

// 1. ADD AGENT
router.post("/add-agent", verifyToken, async (req, res) => {
  try {
    if (!req.body.email || !req.body.password || !req.body.name) {
        return res.status(400).json({ message: "All fields are required!" });
    }

    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) return res.status(400).json({ message: "Email already exists!" });

    const newAgent = new User({
      name: req.body.name,
      email: req.body.email,
      password: CryptoJS.AES.encrypt(req.body.password, process.env.PASS_SEC).toString(),
      role: "agent",
      ownerId: req.user.id, // Log wela inna Owner ge ID eka
      businessName: req.user.businessName || "Agent"
    });

    const savedAgent = await newAgent.save();
    res.status(201).json(savedAgent);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 2. GET AGENTS
router.get("/agents", verifyToken, async (req, res) => {
  try {
    const agents = await User.find({ ownerId: req.user.id });
    res.status(200).json(agents);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 3. UPDATE AGENT (EDIT) - New Route
router.put("/agent/:id", verifyToken, async (req, res) => {
  try {
    // Password eka wenas karanawa nam encrypt karanna ona
    if (req.body.password) {
      req.body.password = CryptoJS.AES.encrypt(
        req.body.password,
        process.env.PASS_SEC
      ).toString();
    }

    const updatedAgent = await User.findByIdAndUpdate(
      req.params.id,
      {
        $set: req.body,
      },
      { new: true }
    );
    res.status(200).json(updatedAgent);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 4. DELETE AGENT - New Route
router.delete("/agent/:id", verifyToken, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.status(200).json("Agent has been deleted...");
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;