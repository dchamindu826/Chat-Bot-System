const router = require('express').Router();
const axios = require('axios');
const User = require('../models/User');
const Contact = require('../models/Contact');
const Message = require('../models/Message');
const BotConfig = require('../models/BotConfig');
const ChatSession = require('../models/ChatSession'); // ✅ New Model Import

// 1. VERIFICATION ROUTE
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const myVerifyToken = process.env.META_VERIFY_TOKEN;

  if (mode && token) {
    if (mode === 'subscribe' && token === myVerifyToken) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// 2. MESSAGE HANDLING ROUTE
router.post('/', async (req, res) => {
  const body = req.body;

  try {
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;

          if (value.messages && value.messages.length > 0) {
            const phone_number_id = value.metadata.phone_number_id;
            const msgObj = value.messages[0];
            const from = msgObj.from;
            const msgBody = msgObj.text ? msgObj.text.body : (msgObj.type === 'image' ? 'Image' : 'Media');

            // 1. Find Client
            const client = await User.findOne({ "whatsappConfig.phoneNumberId": phone_number_id });

            if (client) {
              // 2. Save Contact & Message (CRM Part)
              // ... (CRM Save Logic - කලින් දුන්න කෝඩ් එකේ වගේම තියන්න) ...
              await updateCRM(client, from, msgBody);

              // 3. --- NEW BOT LOGIC (Sequential) ---
              const botConfig = await BotConfig.findOne({ ownerId: client._id });

              if (botConfig && botConfig.isActive && botConfig.replies.length > 0) {
                
                // A. Session එක හොයනවා හෝ අලුතින් හදනවා
                let session = await ChatSession.findOne({ userId: client._id, phoneNumber: from });
                
                if (!session) {
                  session = new ChatSession({ userId: client._id, phoneNumber: from, currentStep: 0 });
                  await session.save();
                }

                // B. යවන්න ඕන Reply එක තෝරගන්නවා
                const currentStepIndex = session.currentStep;

                if (currentStepIndex < botConfig.replies.length) {
                  const replyToSend = botConfig.replies[currentStepIndex];

                  // C. Message එක යවනවා
                  await sendWhatsAppMessage(client, from, replyToSend);

                  // D. Bot Reply එක Database එකේ Save කරනවා
                  await Message.create({
                      contactId: (await Contact.findOne({ phoneNumber: from }))._id, // Contact ID එක හොයාගන්න logic එක ලියන්න වෙනවා හරියටම
                      text: replyToSend.text,
                      sender: 'me',
                      ownerId: client._id,
                      isBotReply: true
                  });

                  // E. Step එක වැඩි කරනවා (ඊළඟ පාර ඊළඟ මැසේජ් එක යවන්න)
                  session.currentStep += 1;
                  session.lastActive = Date.now();
                  await session.save();
                } else {
                  console.log("🏁 Bot Flow Completed for this user.");
                  // Flow ඉවරයි නම් මුකුත් කරන්නේ නෑ, හෝ Reset කරන්න පුළුවන්
                }
              }
            }
          }
        }
      }
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } catch (err) {
    console.error("Webhook Error:", err);
    res.sendStatus(500);
  }
});

// Helper: Save to CRM (කලින් කෝඩ් එකේ කොටස Function එකක් කළා පැහැදිලි වෙන්න)
async function updateCRM(client, from, msgBody) {
    let contact = await Contact.findOne({ phoneNumber: from, ownerId: client._id });
    if (!contact) {
        contact = new Contact({ phoneNumber: from, ownerId: client._id, messageCount: 0, status: 'New' });
    }
    contact.lastMessage = msgBody;
    contact.lastMessageTime = new Date();
    contact.messageCount += 1;
    if(contact.messageCount > 1) contact.priority = 'High';
    await contact.save();

    await Message.create({
        contactId: contact._id,
        text: msgBody,
        sender: 'customer',
        ownerId: client._id
    });
}

// Helper: Send WhatsApp Message
const sendWhatsAppMessage = async (client, to, step) => {
  try {
    const url = `https://graph.facebook.com/v17.0/${client.whatsappConfig.phoneNumberId}/messages`;
    const token = client.whatsappConfig.accessToken;

    let data = { messaging_product: "whatsapp", to: to };

    if (step.media) {
       // Media Type Check Logic
       const type = step.mediaType === 'video' ? 'video' : (step.mediaType === 'document' ? 'document' : 'image');
       data.type = type;
       data[type] = { link: step.media, caption: step.text };
    } else {
      data.type = "text";
      data.text = { body: step.text };
    }

    await axios.post(url, data, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error("Send Failed:", error.response ? error.response.data : error.message);
  }
};

module.exports = router;