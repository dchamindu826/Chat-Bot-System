const router = require('express').Router();
const Contact = require('../models/Contact');
const Message = require('../models/Message');
const { verifyToken } = require('../verifyToken');

// 1. GET ALL CONTACTS (With Filters)
router.get('/contacts', verifyToken, async (req, res) => {
  try {
    // Agent කෙනෙක් නම් එයාගේ Leads විතරයි, Client නම් ඔක්කොම
    let query = { ownerId: req.user.id }; 
    
    // Agent View එක සඳහා (UserAgentDash.jsx එකෙන් එවන query එක)
    if (req.query.agentId) {
       query = { assignedTo: req.query.agentId };
    }

    const contacts = await Contact.find(query)
      .populate('assignedTo', 'name')
      .sort({ lastMessageTime: -1 });

    res.status(200).json(contacts);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 2. GET MESSAGES
router.get('/messages/:contactId', verifyToken, async (req, res) => {
  try {
    const messages = await Message.find({ contactId: req.params.contactId }).sort({ createdAt: 1 });
    res.status(200).json(messages);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 3. UPDATE CONTACT
router.put('/contact/:id', verifyToken, async (req, res) => {
  try {
    const updatedContact = await Contact.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    res.status(200).json(updatedContact);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;