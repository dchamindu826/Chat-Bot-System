const router = require("express").Router();
const axios = require("axios");
const { verifyToken } = require("../verifyToken");
const User = require("../models/User");
const Message = require("../models/Message");
const Contact = require("../models/Contact");

// ---------------------------------------------------------
// 1. GET MESSAGES (Chat Open කරන විට)
// ---------------------------------------------------------
router.get("/:contactId", verifyToken, async (req, res) => {
  try {
    // 🔥 FIX: Chat එක Open කළාම Unread Count එක 0 කරන්න
    await Contact.findByIdAndUpdate(req.params.contactId, { unreadCount: 0 });

    const messages = await Message.find({ 
      contactId: req.params.contactId 
    }).sort({ createdAt: 1 }); 
    
    res.status(200).json(messages);
  } catch (err) {
    console.error("Get Messages Error:", err);
    res.status(500).json(err);
  }
});

// ---------------------------------------------------------
// 2. SEND MESSAGE (Agent යවන මැසේජ්)
// ---------------------------------------------------------
router.post("/send", verifyToken, async (req, res) => {
  const { contactId, to, text, type, mediaUrl } = req.body; 

  try {
    const contact = await Contact.findById(contactId);
    if (!contact) return res.status(404).json({ message: "Contact not found" });

    const client = await User.findById(contact.ownerId);
    if (!client || !client.whatsappConfig) return res.status(500).json({ message: "Client Config Error" });

    const { phoneNumberId, accessToken } = client.whatsappConfig;
    if (!phoneNumberId || !accessToken) return res.status(500).json({ message: "Invalid Credentials" });

    const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

    let body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
    };

    if (['image', 'video', 'document', 'audio'].includes(type)) {
        body.type = type;
        body[type] = { link: mediaUrl };
        if (type !== 'audio' && text) {
            body[type].caption = text;
        }
    } else {
        body.type = "text";
        body.text = { body: text };
    }

    await axios.post(url, body, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
    });

    const newMessage = new Message({
        contactId,
        text: text || "Media File", 
        content: mediaUrl || text, 
        type: type || "text",
        sender: "me",
        ownerId: contact.ownerId, 
        direction: "outbound",
        mediaUrl: mediaUrl // 🔥 Save URL so UI shows it
    });
    await newMessage.save();

    await Contact.findByIdAndUpdate(contactId, {
        lastMessage: text || (type === 'text' ? text : `Sent ${type}`),
        lastMessageTime: Date.now()
    });

    res.status(200).json(newMessage);

  } catch (err) {
    const errorData = err.response ? err.response.data : err.message;
    console.error("Send Error:", JSON.stringify(errorData, null, 2));
    res.status(500).json({ error: errorData });
  }
});

module.exports = router;