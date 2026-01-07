const router = require('express').Router();
const User = require('../models/User');
const BotConfig = require('../models/BotConfig');
const ChatSession = require('../models/ChatSession');
const SystemLog = require('../models/SystemLog');
const Message = require('../models/Message'); // <--- New Import
const axios = require('axios');

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "my_secure_verify_token";

// 1. GET Route
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Helper: Error Logger
const logError = async (message, details = {}) => {
  try {
    await SystemLog.create({ type: 'ERROR', source: 'Webhook', message, metaData: details });
  } catch (e) { console.error("Logging Failed:", e); }
};

// Helper: Save Message to DB
const saveMessage = async (userId, phone, direction, type, content) => {
  try {
    await Message.create({
      userId,
      customerPhone: phone,
      direction,
      type,
      content
    });
  } catch (e) { console.error("Message Save Failed:", e); }
};

// Helper: Send WhatsApp Message
const sendWhatsAppMessage = async (client, to, reply) => {
  try {
    const { phoneNumberId, accessToken } = client.whatsappConfig;
    
    let data = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
    };

    let msgContent = ""; // To save in DB

    if (reply.media) {
      const type = reply.mediaType === 'image' ? 'image' :
                   reply.mediaType === 'video' ? 'video' : 'document';
      data.type = type;
      data[type] = { link: reply.media };
      if (reply.content) data[type].caption = reply.content;
      if(type === 'document') data[type].filename = reply.fileName || "Document.pdf";
      
      msgContent = reply.media; // Save URL as content
    } else if (reply.content) {
      data.type = "text";
      data.text = { body: reply.content };
      msgContent = reply.content;
    } else {
      return;
    }

    await axios.post(
      `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`,
      data,
      { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );

    // Save Outbound Message
    await saveMessage(client._id, to, 'outbound', reply.media ? reply.mediaType : 'text', msgContent);

  } catch (error) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    await logError("Failed to send WhatsApp message", { to, error: errMsg });
    throw error;
  }
};

// 2. POST Route
router.post('/', async (req, res) => {
  const body = req.body;

  if (body.object) {
    try {
      if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0].value.messages &&
        body.entry[0].changes[0].value.messages[0]
      ) {
        const change = body.entry[0].changes[0].value;
        const phoneNumberId = change.metadata.phone_number_id;
        const from = change.messages[0].from;
        const msgType = change.messages[0].type;
        const msgBody = change.messages[0].text ? change.messages[0].text.body : "[Media]";

        // Find Client
        const client = await User.findOne({ 'whatsappConfig.phoneNumberId': phoneNumberId });
        if (!client) {
          await logError("Client not found for Phone ID", { phoneNumberId });
          return res.sendStatus(200);
        }

        // Save Inbound Message (Customer's Message)
        if (msgType === 'text') {
           await saveMessage(client._id, from, 'inbound', 'text', msgBody);
        }

        // --- BOT LOGIC ---
        const botConfig = await BotConfig.findOne({ userId: client._id });
        if (!botConfig || botConfig.replies.length === 0) return res.sendStatus(200);

        let session = await ChatSession.findOne({ userId: client._id, phoneNumber: from });
        if (!session) {
          session = new ChatSession({ userId: client._id, phoneNumber: from, currentStep: 0 });
        }

        let currentStep = session.currentStep;

        if (currentStep < botConfig.replies.length) {
          const replyToSend = botConfig.replies[currentStep];
          
          // Updated Send Function (Passes whole client object)
          await sendWhatsAppMessage(client, from, replyToSend);

          session.currentStep += 1;
          session.lastActive = Date.now();
          await session.save();
        } 
      }
    } catch (err) {
      console.error("Webhook Error:", err.message);
      await logError("Critical Webhook Error", { error: err.message });
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

module.exports = router;