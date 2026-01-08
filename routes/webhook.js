const router = require('express').Router();
const User = require('../models/User');
const BotConfig = require('../models/BotConfig');
const ChatSession = require('../models/ChatSession');
const SystemLog = require('../models/SystemLog');
const Message = require('../models/Message');
const Contact = require('../models/Contact');
const axios = require('axios');

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "my_secure_verify_token";

// 1. GET Route
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log("✅ Webhook Verified!");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Helper: Save Message
const saveMessage = async (userId, phone, direction, type, content) => {
  try {
    await Message.create({ userId, customerPhone: phone, direction, type, content });
  } catch (e) { console.error("Message Save Failed:", e); }
};

// Helper: Update Contact
const updateContact = async (clientId, phone, msgBody) => {
    try {
      let contact = await Contact.findOne({ ownerId: clientId, phoneNumber: phone });
      if (contact) {
        contact.messageCount += 1;
        contact.lastMessage = msgBody;
        contact.lastMessageTime = Date.now();
        if (contact.messageCount > 1) contact.priority = 'High';
        await contact.save();
      } else {
        await Contact.create({
          ownerId: clientId,
          phoneNumber: phone,
          lastMessage: msgBody,
          lastMessageTime: Date.now(),
          messageCount: 1,
          priority: 'Low',
          callStatus: 'Pending',
          assignedTo: null
        });
      }
    } catch (e) { console.error("Contact Update Failed:", e); }
};

// Helper: Send WhatsApp Message
const sendWhatsAppMessage = async (client, to, reply) => {
  try {
    const { phoneNumberId, accessToken } = client.whatsappConfig;
    
    console.log(`📤 Sending Reply via ID: ${phoneNumberId}`); // LOG

    let data = { messaging_product: "whatsapp", recipient_type: "individual", to: to };
    let msgContent = "";

    if (reply.media) {
      const type = reply.mediaType === 'image' ? 'image' : reply.mediaType === 'video' ? 'video' : 'document';
      data.type = type;
      data[type] = { link: reply.media };
      if (reply.content) data[type].caption = reply.content; // Use .content
      if(reply.text) data[type].caption = reply.text; // Use .text (backup)
      
      if(type === 'document') data[type].filename = reply.fileName || "Document.pdf";
      msgContent = reply.media;
    } else {
      data.type = "text";
      data.text = { body: reply.text || reply.content || "..." }; // Handle both text/content keys
      msgContent = data.text.body;
    }

    await axios.post(
      `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`,
      data,
      { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );

    await saveMessage(client._id, to, 'outbound', 'text', msgContent);
    console.log("✅ Message Sent to Meta API!"); // LOG

  } catch (error) {
    console.error("❌ Send Message Failed:", error.response ? error.response.data : error.message);
    throw error;
  }
};

// 2. POST Route
router.post('/', async (req, res) => {
  const body = req.body;
  
  if (body.object) {
    try {
      if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
        
        // 1. Extract Data
        const change = body.entry[0].changes[0].value;
        const incomingPhoneID = change.metadata.phone_number_id; // Meta eken ena ID eka
        const from = change.messages[0].from;
        const msgType = change.messages[0].type;
        const msgBody = change.messages[0].text ? change.messages[0].text.body : "[Media]";

        console.log(`\n📨 INCOMING MESSAGE`);
        console.log(`------------------------------------------------`);
        console.log(`📞 From: ${from}`);
        console.log(`🆔 Incoming Phone ID: ${incomingPhoneID}`); // MEKA WADAGATH

        // 2. Find Client by Phone ID
        const client = await User.findOne({ 'whatsappConfig.phoneNumberId': incomingPhoneID });
        
        if (!client) {
          console.log("❌ ERROR: No Client found with this Phone ID in Database!");
          console.log("👉 Check Admin Panel > Client Settings > Phone Number ID");
          return res.sendStatus(200);
        }

        console.log(`✅ Client Found: ${client.businessName} (${client._id})`);

        // 3. Save Message & Contact
        if (msgType === 'text') {
           await saveMessage(client._id, from, 'inbound', 'text', msgBody);
           await updateContact(client._id, from, msgBody);
        }

        // 4. Check Bot Config
        // Note: Check if your DB uses 'userId' or 'ownerId'. Our models use 'ownerId', but BotConfig might use 'userId'.
        // Let's try both to be safe.
        let botConfig = await BotConfig.findOne({ ownerId: client._id });
        if(!botConfig) botConfig = await BotConfig.findOne({ userId: client._id });

        if (!botConfig) {
             console.log("⚠️ No Bot Config found for this client.");
             return res.sendStatus(200);
        }
        
        if (!botConfig.isActive) {
             console.log("⚠️ Bot is turned OFF.");
             return res.sendStatus(200);
        }

        if (!botConfig.replies || botConfig.replies.length === 0) {
             console.log("⚠️ Bot has empty replies list.");
             return res.sendStatus(200);
        }

        // 5. Session Logic
        let session = await ChatSession.findOne({ userId: client._id, phoneNumber: from });
        if (!session) {
          session = new ChatSession({ userId: client._id, phoneNumber: from, currentStep: 0 });
          console.log("🆕 New Chat Session Created");
        }

        let currentStep = session.currentStep;
        console.log(`🤖 Current Step: ${currentStep} / ${botConfig.replies.length}`);

        if (currentStep < botConfig.replies.length) {
          const replyToSend = botConfig.replies[currentStep];
          
          console.log("🚀 Sending Reply...");
          await sendWhatsAppMessage(client, from, replyToSend);

          session.currentStep += 1;
          session.lastActive = Date.now();
          await session.save();
        } else {
            console.log("🏁 Conversation Flow Ended.");
        }
      }
    } catch (err) {
      console.error("❌ CRITICAL ERROR:", err.message);
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

module.exports = router;