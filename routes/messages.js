const router = require("express").Router();
const axios = require("axios");
const { verifyToken } = require("../verifyToken");
const User = require("../models/User");
const Message = require("../models/Message");
const Contact = require("../models/Contact");

// ---------------------------------------------------------
// 1. GET MESSAGES (Same as before)
// ---------------------------------------------------------
router.get("/:contactId", verifyToken, async (req, res) => {
  try {
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
// 2. SEND MESSAGE (🔥 FIXED LOGIC FOR AGENTS)
// ---------------------------------------------------------
router.post("/send", verifyToken, async (req, res) => {
  const { contactId, to, text, type, mediaUrl } = req.body; 

  try {
    // 1️⃣ ISSARALA CONTACT HOYAMU (Mokada a contact aithi Client ta)
    const contact = await Contact.findById(contactId);
    if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
    }

    // 2️⃣ CONTACT GE OWNER (CLIENT) WA HOYAMU
    // Agent log wela hitiyath, api config ganne me Owner gen.
    const client = await User.findById(contact.ownerId);
    
    if (!client || !client.whatsappConfig) {
        return res.status(500).json({ message: "Client WhatsApp Config Not Found in DB" });
    }

    const { phoneNumberId, accessToken } = client.whatsappConfig;

    if (!phoneNumberId || !accessToken) {
        return res.status(500).json({ message: "Invalid Client Credentials" });
    }

    const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

    // 3️⃣ Message Body
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

    // 4️⃣ Send to Meta (Using Client's Token)
    await axios.post(url, body, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
    });

    // 5️⃣ Save to DB
    // sender: "me" kiyanne api yawapu message ekak nisa.
    // ownerId: contact.ownerId (Client) wenna ona, ethakota Client ta meka eyage dashboard eke penawa.
    const newMessage = new Message({
        contactId,
        text: text || "Media File", 
        content: mediaUrl || text, 
        type: type || "text",
        sender: "me",
        ownerId: contact.ownerId, // Save under the Client ID
        direction: "outbound"
    });
    await newMessage.save();

    // 6️⃣ Update Contact
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