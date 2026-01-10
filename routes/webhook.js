const router = require("express").Router();
const axios = require("axios");
const User = require("../models/User");
const Contact = require("../models/Contact");
const Message = require("../models/Message");
const BotConfig = require("../models/BotConfig");
const ChatSession = require("../models/ChatSession");

// ==========================================
// 1. VERIFICATION ROUTE
// ==========================================
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const myVerifyToken = process.env.VERIFY_TOKEN || "mysecrettoken";

  if (mode && token) {
    if (mode === "subscribe" && token === myVerifyToken) {
      console.log("✅ Webhook Verified!");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// ==========================================
// 2. MESSAGE HANDLING ROUTE (DEBUG VERSION)
// ==========================================
router.post("/", async (req, res) => {
  // 1. Log Raw Data
  // console.log("📩 RECEIVED:", JSON.stringify(req.body, null, 2)); 
  // (Log එක clean තියාගන්න මේක comment කළා, ඕනෙනම් Uncomment කරගන්න)
  
  res.status(200).send("EVENT_RECEIVED");

  const body = req.body;

  try {
    if (body.object === "whatsapp_business_account") {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;

          if (value.messages && value.messages.length > 0) {
            const phone_number_id = value.metadata.phone_number_id;
            const msgObj = value.messages[0];
            const from = msgObj.from;
            
            let msgBody = "Media File";
            if (msgObj.type === "text") msgBody = msgObj.text.body;
            else if (msgObj.type === "image") msgBody = "📷 Image Received";
            
            console.log(`➡️ Message from ${from}: ${msgBody}`);

            // 1. Client Find
            const client = await User.findOne({ "whatsappConfig.phoneNumberId": phone_number_id });

            if (!client) {
                console.error("❌ ERROR: No Client found for this Phone ID!");
                continue; // Skip loop
            }

            console.log(`✅ Client Found: ${client.email} (ID: ${client._id})`);

            // ---------------------------------------------------------
            // PART A: CRM UPDATE
            // ---------------------------------------------------------
            let contact = await Contact.findOne({ phoneNumber: from, ownerId: client._id });
            
            if (!contact) {
              contact = new Contact({
                phoneNumber: from,
                ownerId: client._id,
                name: `Guest ${from.slice(-4)}`,
                callStatus: "Pending",
                priority: "Low",
                messageCount: 0 
              });
            }

            const currentMsgCount = (contact.messageCount || 0) + 1;
            let newPriority = "Low";
            if (currentMsgCount >= 2 && currentMsgCount < 4) newPriority = "Medium";
            if (currentMsgCount >= 4) newPriority = "High"; 

            contact.lastMessage = msgBody;
            contact.lastMessageTime = new Date();
            contact.messageCount = currentMsgCount;
            contact.priority = newPriority;
            
            await contact.save();

            await Message.create({
              contactId: contact._id,
              text: msgBody,
              sender: "customer",
              ownerId: client._id,
              type: msgObj.type
            });

            // ---------------------------------------------------------
            // PART B: BOT LOGIC (DEBUG MODE)
            // ---------------------------------------------------------
            console.log("🤖 Checking Bot Config...");
            const botConfig = await BotConfig.findOne({ ownerId: client._id });

            if (!botConfig) {
                console.error(`❌ ERROR: Bot Config NOT FOUND for Owner ID: ${client._id}`);
                // විසඳුම: Frontend එකට ගිහින් "Save Flow" ඔබන්න.
                continue;
            }

            if (!botConfig.isActive) {
                console.log("⚠️ Bot is disabled (isActive: false)");
                continue;
            }

            if (!botConfig.replies || botConfig.replies.length === 0) {
                console.log("⚠️ Bot has NO replies configured.");
                continue;
            }

            console.log(`✅ Bot Config Loaded. Total Steps: ${botConfig.replies.length}`);

            let session = await ChatSession.findOne({ userId: client._id, phoneNumber: from });

            if (!session) {
                console.log("🆕 New Session Created.");
                session = new ChatSession({ userId: client._id, phoneNumber: from, currentStep: 0 });
            }

            // RESET LOGIC
            const lowerMsg = msgBody.toLowerCase();
            if (lowerMsg.includes("hi") || lowerMsg.includes("start") || lowerMsg.includes("menu")) {
                console.log(`🔄 RESET TRIGGERED by keyword: "${msgBody}"`);
                session.currentStep = 0; 
            }

            console.log(`ℹ️ Current Step for ${from}: ${session.currentStep}`);

            // CHECK STEPS
            if (session.currentStep < botConfig.replies.length) {
                
                const replyToSend = botConfig.replies[session.currentStep];
                console.log(`📤 Sending Step ${session.currentStep + 1}: ${replyToSend.text}`);

                await sendWhatsAppMessage(client, from, replyToSend);

                await Message.create({
                    contactId: contact._id,
                    text: replyToSend.text || (replyToSend.media ? "Sent Media" : "Bot Reply"),
                    sender: "me",
                    ownerId: client._id,
                    isBotReply: true
                });

                // Move to next step
                session.currentStep += 1;
                session.lastActive = Date.now();
                await session.save();
                console.log(`✅ Moved to Next Step: ${session.currentStep}`);

            } else {
                console.log(`🚫 STOPPED: All steps finished for ${from}. Waiting for Agent.`);
            }
          
          }
        }
      }
    } else {
      res.sendStatus(404);
    }
  } catch (err) {
    console.error("❌ WEBHOOK CRASH:", err);
    res.sendStatus(500);
  }
});

// ==========================================
// HELPER: Send Message
// ==========================================
const sendWhatsAppMessage = async (client, to, replyStep) => {
  try {
    const url = `https://graph.facebook.com/v17.0/${client.whatsappConfig.phoneNumberId}/messages`;
    const token = client.whatsappConfig.accessToken;

    let body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
    };

    if (replyStep.media && replyStep.media !== "") {
      const type = replyStep.mediaType || "image";
      body.type = type;
      
      body[type] = {
        link: replyStep.media,
        caption: replyStep.text || ""
      };

      if (type === "document" && replyStep.fileName) {
         body[type].filename = replyStep.fileName;
      }
    } else {
      body.type = "text";
      body.text = { body: replyStep.text };
    }

    const response = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    // console.log("✅ Meta API Response:", response.data); 

  } catch (error) {
    console.error("❌ WhatsApp Send Failed:", error.response ? error.response.data : error.message);
  }
};

module.exports = router;