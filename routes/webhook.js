const router = require('express').Router();
const User = require('../models/User');
const BotConfig = require('../models/BotConfig');
const axios = require('axios');

// ඔයා Meta App Dashboard එකේ Webhook Setup කරනකොට දෙන token එක
const VERIFY_TOKEN = "my_secure_verify_token"; 

// 1. GET Route (Meta Verification සඳහා)
// Meta එකෙන් මුලින්ම අපේ Server එක check කරනවා මේක ඇත්තටම වැඩද කියලා.
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// 2. POST Route (Incoming Messages Handle කිරීම)
router.post('/', async (req, res) => {
  const body = req.body;

  // Check if this is an event from a WhatsApp API
  if (body.object) {
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      // 1. Extract Data
      const change = body.entry[0].changes[0].value;
      const phoneNumberId = change.metadata.phone_number_id; // Business Phone ID
      const from = change.messages[0].from; // Customer's Phone Number
      const msgBody = change.messages[0].text?.body || ""; // Customer's Message
      const msgType = change.messages[0].type;

      console.log(`📩 New Message from ${from} to Business ID ${phoneNumberId}: ${msgBody}`);

      try {
        // 2. Find the Client (Business Owner) using phoneNumberId
        // අපි බලනවා මේ ID එක අයිති මොන User ටද කියලා
        const client = await User.findOne({ 'whatsappConfig.phoneNumberId': phoneNumberId });

        if (!client) {
          console.log("❌ Client not found for this Phone ID");
          return res.sendStatus(404);
        }

        // 3. Find Bot Config for this Client
        const botConfig = await BotConfig.findOne({ userId: client._id });

        if (botConfig && botConfig.replies.length > 0) {
          // --- SIMPLE BOT LOGIC ---
          // දැනට අපි කරන්නේ, මොන මැසේජ් එක ආවත් Bot එකේ තියෙන පලවෙනි Reply එක යවන එක.
          // පස්සේ අපිට පුළුවන් "Hi" කිව්වොත් එකක්, "Price" කිව්වොත් එකක් යවන්න හදන්න.
          
          // අපි පිළිවෙලට මැසේජ් ටික යවමු (Loop through replies)
          for (const reply of botConfig.replies) {
            await sendWhatsAppMessage(client.whatsappConfig.accessToken, phoneNumberId, from, reply);
          }
        }

      } catch (err) {
        console.error("Error processing message:", err.message);
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// Helper Function: Send Message to WhatsApp
const sendWhatsAppMessage = async (token, phoneId, to, reply) => {
  try {
    let data = {
      messaging_product: "whatsapp",
      to: to,
    };

    // Text Message or Media Message?
    if (reply.media) {
      // MEDIA MESSAGE (Image/Video/Doc)
      const type = reply.mediaType === 'image' ? 'image' : 
                   reply.mediaType === 'video' ? 'video' : 'document';
      
      data.type = type;
      data[type] = {
        link: reply.media,
        caption: reply.content || "" // Caption එකට Text එක දානවා
      };
      
      // Document එකක් නම් filename එකත් ඕන වෙන්න පුළුවන්
      if(type === 'document' && reply.fileName) {
          data[type].filename = reply.fileName;
      }

    } else {
      // TEXT ONLY MESSAGE
      data.type = "text";
      data.text = { body: reply.content };
    }

    await axios.post(
      `https://graph.facebook.com/v17.0/${phoneId}/messages`,
      data,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log("✅ Message Sent!");

  } catch (error) {
    console.error("❌ Failed to send message:", error.response ? error.response.data : error.message);
  }
};

module.exports = router;