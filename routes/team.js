const router = require('express').Router();
const User = require('../models/User');
const Contact = require('../models/Contact');
const CryptoJS = require("crypto-js");
const { verifyToken } = require('../verifyToken');

// 1. ADD NEW AGENT (User Dashboard එකෙන් හදන්නේ)
router.post('/add-agent', verifyToken, async (req, res) => {
  try {
    const encryptedPassword = CryptoJS.AES.encrypt(
      req.body.password,
      process.env.PASS_SEC
    ).toString();

    const newAgent = new User({
      name: req.body.name,
      email: req.body.email,
      password: encryptedPassword,
      role: 'agent',
      ownerId: req.user.id, // Log වෙලා ඉන්න User (Client) තමයි අයිතිකාරයා
      businessName: req.user.businessName
    });

    const savedAgent = await newAgent.save();
    res.status(200).json(savedAgent);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 2. GET MY AGENTS
router.get('/agents', verifyToken, async (req, res) => {
  try {
    const agents = await User.find({ ownerId: req.user.id, role: 'agent' });
    // Password අයින් කරලා යවනවා
    const agentsData = agents.map(agent => {
        const { password, ...others } = agent._doc;
        return others;
    });
    res.status(200).json(agentsData);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 3. ASSIGN CHATS TO AGENT (Bulk Assign)
router.put('/assign-chats', verifyToken, async (req, res) => {
  try {
    // req.body.contactIds = ['id1', 'id2']
    // req.body.agentId = 'agent_user_id'
    
    await Contact.updateMany(
      { _id: { $in: req.body.contactIds }, ownerId: req.user.id },
      { $set: { assignedTo: req.body.agentId, status: 'Pending' } }
    );
    
    res.status(200).json("Chats assigned successfully!");
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;