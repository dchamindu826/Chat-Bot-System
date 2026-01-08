const router = require('express').Router();
const Contact = require('../models/Contact');
const Message = require('../models/Message');
const User = require('../models/User');
const { verifyToken } = require('../verifyToken');

// 1. GET ALL CONTACTS (With Filters)
router.get('/contacts', verifyToken, async (req, res) => {
  try {
    let query = { ownerId: req.user.id }; // Client ට අදාල ඒවා විතරයි

    // Filters (Frontend එකෙන් එවන විදියට)
    if (req.query.status) query.status = req.query.status;
    if (req.query.agentId) query.assignedTo = req.query.agentId;
    if (req.query.priority) query.priority = req.query.priority;

    const contacts = await Contact.find(query)
      .populate('assignedTo', 'name') // Agent ගේ නම පෙන්නන්න
      .sort({ lastMessageTime: -1 }); // අලුත් ඒවා උඩින්

    res.status(200).json(contacts);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 2. GET MESSAGES FOR A CONTACT
router.get('/messages/:contactId', verifyToken, async (req, res) => {
  try {
    const messages = await Message.find({ contactId: req.params.contactId })
      .sort({ createdAt: 1 }); // පරණ ඒවා උඩින්
    res.status(200).json(messages);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 3. UPDATE CONTACT STATUS / PRIORITY / AGENT
router.put('/contact/:id', verifyToken, async (req, res) => {
  try {
    const updatedContact = await Contact.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    ).populate('assignedTo', 'name');
    res.status(200).json(updatedContact);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;