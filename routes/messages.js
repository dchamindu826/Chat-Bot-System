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
    // 1. Client Config ගන්න
    const client = await User.findById(req.user.id);
    if (!client || !client.whatsappConfig) {
        return res.status(400).json({ message: "WhatsApp Config not found" });
    }

    const { phoneNumberId, accessToken } = client.whatsappConfig;
    const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

    // 2. Message Body හදනවා
    let body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
    };

    if (type === 'image' || type === 'video' || type === 'document') {
        body.type = type;
        body[type] = { link: mediaUrl, caption: text || "" };
    } else {
        body.type = "text";
        body.text = { body: text };
    }

    // 3. Send to WhatsApp
    await axios.post(url, body, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
    });

    // 4. Save to Database (අපේ චැට් එකේ පේන්න)
    const newMessage = new Message({
        contactId,
        text: text || "Media File",
        content: mediaUrl || text, // UI එකේ පේන්න
        type: type || "text",
        sender: "me",
        ownerId: req.user.id,
        direction: "outbound"
    });
    await newMessage.save();

    // Update Contact Last Message
    await Contact.findByIdAndUpdate(contactId, {
        lastMessage: text || "Sent Media",
        lastMessageTime: Date.now()
    });

    res.status(200).json(newMessage);

  } catch (err) {
    console.error("Send Error:", err.response ? err.response.data : err.message);
    res.status(500).json(err);
  }
});

module.exports = router;