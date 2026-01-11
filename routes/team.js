const router = require("express").Router();
const User = require("../models/User");
const Contact = require("../models/Contact");
const CryptoJS = require("crypto-js");
const { verifyToken } = require("../verifyToken");

// 1. ADD AGENT (Unchanged)
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
      ownerId: req.user.id,
      businessName: req.user.businessName || "Agent"
    });

    const savedAgent = await newAgent.save();
    res.status(201).json(savedAgent);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 🔥 2. GET AGENTS (UPDATED WITH COUNT LOGIC)
router.get("/agents", verifyToken, async (req, res) => {
  try {
    const agents = await User.find({ ownerId: req.user.id });

    // හැම Agent ටම අදාලව Assign වෙලා තියෙන Contacts ගණන හොයමු
    const agentsWithCounts = await Promise.all(agents.map(async (agent) => {
        const count = await Contact.countDocuments({ 
            ownerId: req.user.id, 
            assignedTo: agent._id  // Agent ID එකට මැච් වෙන ඒවා විතරක් ගණන් කරන්න
        });
        
        // Agent Object එකට 'leadCount' කියන අලුත් කෑල්ල එකතු කරලා යවනවා
        return { 
            ...agent._doc, 
            leadCount: count 
        };
    }));

    res.status(200).json(agentsWithCounts);
  } catch (err) {
    console.error(err);
    res.status(500).json(err);
  }
});

// 3. UPDATE AGENT (Unchanged)
router.put("/agent/:id", verifyToken, async (req, res) => {
  try {
    if (req.body.password) {
      req.body.password = CryptoJS.AES.encrypt(
        req.body.password,
        process.env.PASS_SEC
      ).toString();
    }
    const updatedAgent = await User.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    res.status(200).json(updatedAgent);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 4. DELETE AGENT (Unchanged)
router.delete("/agent/:id", verifyToken, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.status(200).json("Agent has been deleted...");
  } catch (err) {
    res.status(500).json(err);
  }
});

// 5. ASSIGN CHATS
router.put("/assign-chats", verifyToken, async (req, res) => {
    try {
      const { contactIds, agentId } = req.body;
      if (!contactIds || !agentId) {
        return res.status(400).json({ message: "Contacts and Agent ID required" });
      }
      await Contact.updateMany(
        { _id: { $in: contactIds } },
        { $set: { assignedTo: agentId } }
      );
      res.status(200).json({ message: "Contacts assigned successfully!" });
    } catch (err) {
      res.status(500).json(err);
    }
});

// 🔥🔥🔥 6. RESET ROUTE (TEMPORARY FIX)
// මේක එක පාරක් රන් කරලා ඔක්කොම Unassign කරන්න පුළුවන්
router.put("/reset-assignments", verifyToken, async (req, res) => {
    try {
        await Contact.updateMany(
            { ownerId: req.user.id }, 
            { $set: { assignedTo: null } }
        );
        res.status(200).json({ message: "All contacts unassigned successfully!" });
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;