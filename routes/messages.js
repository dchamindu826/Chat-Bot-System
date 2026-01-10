const router = require("express").Router();
const axios = require("axios");
const { verifyToken } = require("../verifyToken");
const User = require("../models/User");
const Message = require("../models/Message");
const Contact = require("../models/Contact");

// ---------------------------------------------------------
// 1. GET MESSAGES (For Chat History)
// Frontend Request: GET /api/crm/messages/:contactId
// ---------------------------------------------------------
router.get("/:contactId", verifyToken, async (req, res) => {
  try {
    // 🔥 FIX: Methana 'ownerId' filter eka ain kala.
    // Ethakota Agent ta Admin ge chat history ekath penawa.
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
// 2. SEND MESSAGE (Fix for Agent Sending Error)
// ---------------------------------------------------------
router.post("/send", verifyToken, async (req, res) => {
  const { contactId, to, text, type, mediaUrl } = req.body; 

  try {
    const senderUser = await User.findById(req.user.id);

    // --- 🔥 AGENT FIX START ---
    // User ge config eka gannawa. Eka nattam, System .env eken gannawa.
    let phoneNumberId = senderUser?.whatsappConfig?.phoneNumberId;
    let accessToken = senderUser?.whatsappConfig?.accessToken;

    if (!phoneNumberId) phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!accessToken) accessToken = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
        return res.status(500).json({ message: "WhatsApp Configuration Missing (Check .env)" });
    }
    // --- AGENT FIX END ---

    const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

    // Construct WhatsApp Payload
    let body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
    };

    if (['image', 'video', 'document', 'audio'].includes(type)) {
        body.type = type;
        body[type] = { link: mediaUrl };
        // Audio walata caption danna ba error enawa, anith ewata caption denawa
        if (type !== 'audio' && text) {
            body[type].caption = text;
        }
    } else {
        body.type = "text";
        body.text = { body: text };
    }

    // Send to Meta API
    await axios.post(url, body, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
    });

    // Save to Database
    // Note: Frontend display sadaha 'text' saha 'content' dekama update karanawa
    const newMessage = new Message({
        contactId,
        text: text || "Media File", 
        content: mediaUrl || text, 
        type: type || "text",
        sender: "me",
        ownerId: req.user.id,
        direction: "outbound"
    });
    await newMessage.save();

    // Update Contact's Last Message
    await Contact.findByIdAndUpdate(contactId, {
        lastMessage: text || (type === 'text' ? text : `Sent ${type}`),
        lastMessageTime: Date.now()
    });

    res.status(200).json(newMessage);

  } catch (err) {
    const errorData = err.response ? err.response.data : err.message;
    console.error("Send Error:", errorData);
    res.status(500).json({ error: errorData });
  }
});

module.exports = router;