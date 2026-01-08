const router = require('express').Router();
const User = require('../models/User');
const Contact = require('../models/Contact');
const CryptoJS = require("crypto-js");
const { verifyToken } = require('../verifyToken');

// 1. ADD NEW AGENT
router.post('/add-agent', verifyToken, async (req, res) => {
  try {
    const encryptedPassword = CryptoJS.AES.encrypt(req.body.password, process.env.PASS_SEC).toString();
    const newAgent = new User({
      name: req.body.name,
      email: req.body.email,
      password: encryptedPassword,
      role: 'agent',
      ownerId: req.user.id,
      businessName: req.user.businessName || "My Business"
    });
    const savedAgent = await newAgent.save();
    res.status(200).json(savedAgent);
  } catch (err) { res.status(500).json(err); }
});

// 2. GET AGENTS
router.get('/agents', verifyToken, async (req, res) => {
  try {
    const agents = await User.find({ ownerId: req.user.id, role: 'agent' });
    const agentsData = agents.map(agent => { const { password, ...others } = agent._doc; return others; });
    res.status(200).json(agentsData);
  } catch (err) { res.status(500).json(err); }
});

// ✅ 3. DELETE AGENT (New)
router.delete('/agent/:id', verifyToken, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    // Optional: Agent අයින් කළාම එයාට Assign කරපු Chats ආයේ "Unassigned" කරනවා
    await Contact.updateMany({ assignedTo: req.params.id }, { $set: { assignedTo: null, status: 'New' } });
    res.status(200).json("Agent deleted successfully");
  } catch (err) { res.status(500).json(err); }
});

// ✅ 4. UPDATE AGENT (New - Name/Email only)
router.put('/agent/:id', verifyToken, async (req, res) => {
  try {
    if(req.body.password) {
        req.body.password = CryptoJS.AES.encrypt(req.body.password, process.env.PASS_SEC).toString();
    }
    const updatedAgent = await User.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    res.status(200).json(updatedAgent);
  } catch (err) { res.status(500).json(err); }
});

// 5. ASSIGN CHATS
router.put('/assign-chats', verifyToken, async (req, res) => {
  try {
    await Contact.updateMany(
      { _id: { $in: req.body.contactIds }, ownerId: req.user.id },
      { $set: { assignedTo: req.body.agentId, status: 'Pending' } }
    );
    res.status(200).json("Assigned successfully!");
  } catch (err) { res.status(500).json(err); }
});

module.exports = router;