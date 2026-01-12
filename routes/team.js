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

// 🔥 2. GET AGENTS LIST (WITH CORRECT COUNTS)
// මේකෙන් තමයි කාඩ් වල එළියේ තියෙන 172, 435 වගේ ඉලක්කම් හරියට පෙන්නන්නේ
router.get("/agents", verifyToken, async (req, res) => {
  try {
    const agents = await User.find({ ownerId: req.user.id });

    // හැම Agent ටම අදාලව Assign වෙලා තියෙන Contacts ගණන හොයමු
    const agentsWithCounts = await Promise.all(agents.map(async (agent) => {
        
        // 1. Total Assigned (Lead Count)
        const totalAssigned = await Contact.countDocuments({ 
            ownerId: req.user.id, 
            assignedTo: agent._id 
        });

        // 2. Covered Count (Answered, Reject, Busy, etc.)
        // Pending ඇරෙන්න අනිත් ඔක්කොම Covered කියලා ගමු
        const coveredCount = await Contact.countDocuments({
            ownerId: req.user.id,
            assignedTo: agent._id,
            callStatus: { $ne: 'Pending' } // Not Equal to Pending
        });
        
        // Data Return කරනවා
        return { 
            ...agent._doc, 
            leadCount: totalAssigned,
            coveredCount: coveredCount,
            successRate: totalAssigned > 0 ? ((coveredCount / totalAssigned) * 100).toFixed(1) : 0
        };
    }));

    res.status(200).json(agentsWithCounts);
  } catch (err) {
    console.error(err);
    res.status(500).json(err);
  }
});

// 🔥🔥🔥 3. GET SPECIFIC AGENT PERFORMANCE (NEW ROUTE) 🔥🔥🔥
// ඔයා අර Modal එක Open කළාම මේ Route එක Call කරන්න ඕන
router.get("/agent-performance/:id", verifyToken, async (req, res) => {
    try {
        const agentId = req.params.id;

        // 1. Stats ගණන් කරමු
        const totalAssigned = await Contact.countDocuments({ assignedTo: agentId });
        const covered = await Contact.countDocuments({ assignedTo: agentId, callStatus: { $ne: 'Pending' } });
        const answered = await Contact.countDocuments({ assignedTo: agentId, callStatus: 'Answered' });

        // 2. Recent Activity (Contacts List)
        // අදාල Agent ගේ විතරක් Contacts අන්තිමට Update වුන පිළිවෙලට
        const recentActivity = await Contact.find({ assignedTo: agentId })
            .sort({ updatedAt: -1 }) // අලුත්ම ඒවා උඩට
            .limit(20); // අන්තිම 20 විතරක් යවමු (Load නොවෙන්න)

        res.status(200).json({
            totalAssigned,
            covered,
            successRate: totalAssigned > 0 ? ((answered / totalAssigned) * 100).toFixed(1) : 0,
            recentActivity
        });

    } catch (err) {
        res.status(500).json(err);
    }
});

// 4. UPDATE AGENT
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

// 5. DELETE AGENT
router.delete("/agent/:id", verifyToken, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    // Optional: Unassign contacts from deleted agent
    await Contact.updateMany({ assignedTo: req.params.id }, { $set: { assignedTo: null } });
    
    res.status(200).json("Agent has been deleted...");
  } catch (err) {
    res.status(500).json(err);
  }
});

// 6. ASSIGN CHATS
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

// 7. RESET ASSIGNMENTS
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