const router = require("express").Router();
const axios = require("axios");
const { verifyToken } = require("../verifyToken");
const User = require("../models/User");
const Message = require("../models/Message");
const Contact = require("../models/Contact");

// ---------------------------------------------
// 1. GET MESSAGES (Me kotasa nathi nisa thamai penne naththe)
// ---------------------------------------------
router.get("/:contactId", verifyToken, async (req, res) => {
  try {
    const messages = await Message.find({ 
      contactId: req.params.contactId 
    }).sort({ createdAt: 1 }); // Kalin apu ewa udin, aluth ewa yatin

    res.status(200).json(messages);
  } catch (err) {
    res.status(500).json(err);
  }
});

// ---------------------------------------------
// 2. SEND MESSAGE (Updated with Agent Fix)
// ---------------------------------------------
router.post("/send", verifyToken, async (req, res) => {
  const { contactId, to, text, type, mediaUrl } = req.body; 

  try {
    // Current User (Agent or Admin)
    const sender = await User.findById(req.user.id);

    // --- CONFIGURATION LOGIC ---
    // User ge profile eke config thiyenawada balanna.
    // Nathnam (Agent nam), Server Env Variables walin ganna.
    
    let phoneNumberId = sender?.whatsappConfig?.phoneNumberId;
    let accessToken = sender?.whatsappConfig?.accessToken;

    // Fallback to .env if user config is missing
    if (!phoneNumberId) phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!accessToken) accessToken = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
        console.error("WhatsApp Config Missing for User:", req.user.id);
        return res.status(500).json({ message: "WhatsApp Configuration missing (Check .env or User Config)" });
    }
    // ---------------------------

    const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

    // WhatsApp API Body
    let body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
    };

    if (type === 'image' || type === 'video' || type === 'document' || type === 'audio') {
        body.type = type;
        body[type] = { link: mediaUrl, caption: text || "" };
        if (type === 'audio') delete body[type].caption; // Audio walata caption ba
    } else {
        body.type = "text";
        body.text = { body: text };
    }

    // Send to Meta
    await axios.post(url, body, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
    });

    // Save to DB
    const newMessage = new Message({
        contactId,
        text: text || "Media File",
        content: mediaUrl || text, 
        type: type || "text",
        sender: "me", // "me" kiyala dammama frontend eken eka right side ekata gannawa
        ownerId: req.user.id, 
        direction: "outbound"
    });
    await newMessage.save();

    // Update Contact Last Message
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