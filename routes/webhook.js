const router = require('express').Router();
const User = require('../models/User');
const BotConfig = require('../models/BotConfig');
const ChatSession = require('../models/ChatSession');
const axios = require('axios');

// ඔයා Meta App Dashboard එකේ Webhook Setup කරනකොට දෙන token එක
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "my_secure_verify_token";

// 1. GET Route (Meta Verification සඳහා)
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

// Helper Function: Send Message to WhatsApp
const sendWhatsAppMessage = async (token, phoneId, to, reply) => {
  try {
    let data = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
    };

    if (reply.media) {
      // MEDIA MESSAGE
      const type = reply.mediaType === 'image' ? 'image' :
                   reply.mediaType === 'video' ? 'video' : 'document';

      data.type = type;
      data[type] = {
        link: reply.media
      };

      // Caption/Text for media
      if (reply.content) {
        data[type].caption = reply.content;
      }

      // Filename for documents
      if(type === 'document') {
          // නමක් තිබ්බොත් ඒක දානවා, නැත්නම් 'File.pdf' කියලා බොරු නමක් හරි දානවා
          data[type].filename = reply.fileName || "Document.pdf";
      }

    } else if (reply.content) {
      // TEXT ONLY MESSAGE
      data.type = "text";
      data.text = { body: reply.content };
    } else {
      // Empty reply, don't send anything
      console.log("⚠️ Empty reply found, skipping.");
      return;
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
    console.log(`✅ Message sent to ${to}`);

  } catch (error) {
    console.error("❌ Failed to send message:", error.response ? error.response.data : error.message);
    throw error; // Re-throw to handle in the main loop
  }
};


// 2. POST Route (Incoming Messages Handle කිරීම - Sequential Logic)
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
      const change = body.entry[0].changes[0].value;
      const phoneNumberId = change.metadata.phone_number_id; // Business Phone ID
      const from = change.messages[0].from; // Customer's Phone Number
      const msgType = change.messages[0].type;

      // Only process text or interactive messages for now, ignore status updates etc.
      if (msgType !== 'text' && msgType !== 'interactive' && msgType !== 'button') {
         return res.sendStatus(200);
      }

      console.log(`📩 New Message from ${from} to Business ID ${phoneNumberId}`);

      try {
        // A. Find the Client (Business Owner)
        const client = await User.findOne({ 'whatsappConfig.phoneNumberId': phoneNumberId });
        if (!client) {
          console.log("❌ Client not found for this Phone ID");
          return res.sendStatus(200);
        }

        // B. Find Bot Config
        const botConfig = await BotConfig.findOne({ userId: client._id });
        if (!botConfig || botConfig.replies.length === 0) {
          console.log("⚠️ No bot config or replies found for this client.");
          return res.sendStatus(200);
        }

        // C. Find or Create Chat Session
        let session = await ChatSession.findOne({ userId: client._id, phoneNumber: from });
        if (!session) {
          session = new ChatSession({ userId: client._id, phoneNumber: from, currentStep: 0 });
          console.log(`🆕 New session created for ${from}`);
        }

        // D. Determine the Reply based on currentStep
        let currentStep = session.currentStep;

        // If we still have steps left in the config
        if (currentStep < botConfig.replies.length) {
          const replyToSend = botConfig.replies[currentStep];

          // Send the reply
          await sendWhatsAppMessage(
            client.whatsappConfig.accessToken,
            phoneNumberId,
            from,
            replyToSend
          );

          // Increment step for next time and update lastActive
          session.currentStep += 1;
          session.lastActive = Date.now();
          await session.save();
          console.log(`🔄 Step updated to ${session.currentStep} for ${from}`);

        } else {
          // E. End of Flow Logic
          console.log(`🏁 End of bot flow reached for ${from}. No auto-reply sent.`);

          // Optional: You could send a final "Wait for agent" message here if you want.
          // For now, we do nothing, so they can be picked up by a human agent.
          // You could also reset the session if you want the flow to restart next time:
          // session.currentStep = 0; await session.save();
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

module.exports = router;