const router = require("express").Router();
const Contact = require("../models/Contact");
const Message = require("../models/Message");
const { verifyToken } = require("../verifyToken");

// 1. GET ALL CONTACTS (With Populated Agent Details)
router.get("/contacts", verifyToken, async (req, res) => {
  try {
    // .populate("assignedTo") dammama Agent ge Name/Email ekkama enawa
    const contacts = await Contact.find()
      .populate("assignedTo", "name email") 
      .sort({ lastMessageTime: -1 });
      
    res.status(200).json(contacts);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 2. UPDATE CONTACT (Status, Remarks, etc.)
router.put("/contact/:id", verifyToken, async (req, res) => {
  try {
    const updatedContact = await Contact.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    ).populate("assignedTo", "name email");
    
    res.status(200).json(updatedContact);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 3. GET MESSAGES FOR A CONTACT
router.get("/messages/:contactId", verifyToken, async (req, res) => {
  try {
    const messages = await Message.find({ contactId: req.params.contactId })
      .sort({ createdAt: 1 });
    res.status(200).json(messages);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;