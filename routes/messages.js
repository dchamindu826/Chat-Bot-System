const router = require("express").Router();
const axios = require("axios");
const { verifyToken } = require("../verifyToken");
const User = require("../models/User");
const Message = require("../models/Message");
const Contact = require("../models/Contact");

// SEND MESSAGE (Text or Media)
router.post("/send", verifyToken, async (req, res) => {
  const { contactId, to, text, type, mediaUrl } = req.body; // text or media

  try {
    // 1. Message eka yawana User (Agent or Admin) wa ganna
    const sender = await User.findById(req.user.id);

    // --- 🔥 FIX START: Configuration Strategy ---
    // User ge profile eke config thiyenawada balanawa.
    // Nathnam (Agent kenek nam), System Environment Variables (.env) use karanawa.
    
    let phoneNumberId = sender?.whatsappConfig?.phoneNumberId;
    let accessToken = sender?.whatsappConfig?.accessToken;

    // Fallback: DB eke nattam .env eken ganna (Agent fix)
    if (!phoneNumberId) phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!accessToken) accessToken = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;

    // Check if we have valid credentials
    if (!phoneNumberId || !accessToken) {
        console.error("WhatsApp Configuration Missing for User:", req.user.id);
        return res.status(500).json({ message: "WhatsApp Configuration missing in both DB and Env" });
    }
    // --- 🔥 FIX END ---

    const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

    // 2. Message Body hadanawa
    let body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
    };

    if (type === 'image' || type === 'video' || type === 'document' || type === 'audio') {
        body.type = type;
        body[type] = { link: mediaUrl, caption: text || "" };
        // Audio walata caption danna ba, eka handle karanna one nam methana logic eka wenas karanna puluwan
        if (type === 'audio') delete body[type].caption; 
    } else {
        body.type = "text";
        body.text = { body: text };
    }

    // 3. Send to WhatsApp API
    const response = await axios.post(url, body, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
    });

    // 4. Save to Database (Chat eke penna)
    const newMessage = new Message({
        contactId,
        text: text || "Media File",
        content: mediaUrl || text, // UI Display
        type: type || "text",
        sender: "me", // System/Agent sent this
        ownerId: req.user.id, // Save who sent the message (Agent ID)
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
    // Detailed Error Logging
    const errorData = err.response ? err.response.data : err.message;
    console.error("Send Error:", JSON.stringify(errorData, null, 2));
    res.status(500).json({ error: errorData });
  }
});

module.exports = router;