const router = require("express").Router();
const axios = require("axios");
const { verifyToken } = require("../verifyToken");
const User = require("../models/User");
const Message = require("../models/Message");
const Contact = require("../models/Contact");

// ---------------------------------------------------------
// 1. GET MESSAGES
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
// 2. SEND MESSAGE (DEBUG VERSION)
// ---------------------------------------------------------
router.post("/send", verifyToken, async (req, res) => {
  const { contactId, to, text, type, mediaUrl } = req.body; 

  console.log("--- SENDING MESSAGE ---");
  console.log("To:", to);
  console.log("User ID:", req.user.id);

  try {
    const senderUser = await User.findById(req.user.id);

    // Config Check
    let phoneNumberId = senderUser?.whatsappConfig?.phoneNumberId;
    let accessToken = senderUser?.whatsappConfig?.accessToken;

    // Log values to debug (Sensitive info eka hide karala)
    console.log("User Config Found?", !!phoneNumberId);

    if (!phoneNumberId) {
        console.log("Using Env Variable for Phone ID...");
        phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    }
    
    if (!accessToken) {
        console.log("Using Env Variable for Token...");
        accessToken = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
    }

    console.log("Final Phone ID:", phoneNumberId);
    console.log("Final Token Present:", !!accessToken);

    if (!phoneNumberId || !accessToken) {
        console.error("❌ ERROR: Missing Configuration");
        return res.status(500).json({ 
            message: "Configuration Error", 
            detail: "Phone Number ID or Token is missing in .env file" 
        });
    }

    const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

    let body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to, // Ensure this number is clean (no + or spaces ideally, but Meta handles +)
    };

    if (['image', 'video', 'document', 'audio'].includes(type)) {
        body.type = type;
        body[type] = { link: mediaUrl };
        if (type !== 'audio' && text) body[type].caption = text;
    } else {
        body.type = "text";
        body.text = { body: text };
    }

    // Send to Meta
    try {
        await axios.post(url, body, {
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
        });
        console.log("✅ Sent to Meta Successfully");
    } catch (metaError) {
        console.error("❌ Meta API Error:", metaError.response ? metaError.response.data : metaError.message);
        // Meta eken error ekak awoth eka return karanawa frontend ekata
        return res.status(500).json({ 
            error: "Meta API Failed", 
            details: metaError.response ? metaError.response.data : metaError.message 
        });
    }

    // Save to DB
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

    await Contact.findByIdAndUpdate(contactId, {
        lastMessage: text || (type === 'text' ? text : `Sent ${type}`),
        lastMessageTime: Date.now()
    });

    console.log("✅ Saved to DB");
    res.status(200).json(newMessage);

  } catch (err) {
    console.error("❌ Server Error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

module.exports = router;