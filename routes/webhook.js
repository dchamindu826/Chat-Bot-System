const router = require("express").Router();
const axios = require("axios");
const User = require("../models/User");
const Contact = require("../models/Contact");
const Message = require("../models/Message");
const BotConfig = require("../models/BotConfig");
const ChatSession = require("../models/ChatSession");

// ==========================================
// 1. VERIFICATION ROUTE (Meta එකෙන් Check කරන එක)
// ==========================================
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // .env එකේ නැත්නම් කෙලින්ම hardcode කරලා check කරගන්න පුළුවන් (Optional)
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
// 2. MESSAGE HANDLING ROUTE (Main Logic 🧠)
// ==========================================
router.post("/", async (req, res) => {
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
            
            // Message එක Text ද Media ද කියලා බලලා Body එක ගන්නවා
            let msgBody = "Media File";
            if (msgObj.type === "text") msgBody = msgObj.text.body;
            else if (msgObj.type === "image") msgBody = "📷 Image Received";
            else if (msgObj.type === "video") msgBody = "🎥 Video Received";
            else if (msgObj.type === "document") msgBody = "📄 Document Received";

            // 1. මේ Phone ID එක අයිති Client (Admin User) හොයාගන්නවා
            const client = await User.findOne({ "whatsappConfig.phoneNumberId": phone_number_id });

            if (client) {
              
              // ---------------------------------------------------------
              // PART A: CRM UPDATE (Inbox එකට මැසේජ් එක දානවා)
              // ---------------------------------------------------------
              
              // Contact එක හොයනවා හෝ අලුතින් හදනවා
              let contact = await Contact.findOne({ phoneNumber: from, ownerId: client._id });
              
              if (!contact) {
                contact = new Contact({
                  phoneNumber: from,
                  ownerId: client._id,
                  name: `Guest ${from.slice(-4)}`, // නමක් නැති නිසා Guest කියල දානවා
                  status: "New"
                });
              }

              // Contact එක Update කරනවා
              contact.lastMessage = msgBody;
              contact.lastMessageTime = new Date();
              contact.messageCount = (contact.messageCount || 0) + 1;
              await contact.save();

              // Message එක Save කරනවා (Customer එවපු එක)
              await Message.create({
                contactId: contact._id,
                text: msgBody,
                sender: "customer",
                ownerId: client._id,
                type: msgObj.type
              });

              // ---------------------------------------------------------
              // PART B: BOT LOGIC (Auto Reply යවනවා) 🤖
              // ---------------------------------------------------------

              const botConfig = await BotConfig.findOne({ ownerId: client._id });

              // Bot එක ON ද සහ Replies තියෙනවද බලනවා
              if (botConfig && botConfig.isActive && botConfig.replies.length > 0) {
                
                // 1. Session එක ගන්නවා (Customer කලින් කතා කරලද බලන්න)
                let session = await ChatSession.findOne({ userId: client._id, phoneNumber: from });

                if (!session) {
                  // කතා කරලා නැත්නම් අලුත් Session එකක් (Step 0)
                  session = new ChatSession({ userId: client._id, phoneNumber: from, currentStep: 0 });
                }

                // 2. යවන්න ඕන Step එක තෝරගන්නවා
                let currentStepIndex = session.currentStep;

                // Step ගාන ඉවර නම් ආයේ මුල ඉඳන් (Loop) හෝ නවත්තන්න පුළුවන්.
                // දැනට අපි Loop වෙන්න හදමු:
                if (currentStepIndex >= botConfig.replies.length) {
                    currentStepIndex = 0; 
                    session.currentStep = 0; // Reset
                }

                const replyToSend = botConfig.replies[currentStepIndex];

                // 3. WhatsApp Message එක යවනවා (Function එක පහළ තියෙනවා)
                await sendWhatsAppMessage(client, from, replyToSend);

                // 4. Bot යැව්ව මැසේජ් එකත් Inbox එකේ Save කරනවා (Admin ට පේන්න) ✅
                await Message.create({
                    contactId: contact._id,
                    text: replyToSend.text || (replyToSend.media ? "Sent Media" : "Bot Reply"),
                    sender: "me", // "me" කියන්නේ අපි (Bot එක)
                    ownerId: client._id,
                    isBotReply: true
                });

                // 5. ඊළඟ වතාවට Step එක වැඩි කරනවා
                session.currentStep += 1;
                session.lastActive = Date.now();
                await session.save();
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

// ==========================================
// 🛠️ HELPER FUNCTION: Send Message to WhatsApp
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

    // Media තියෙනවද බලනවා
    if (replyStep.media && replyStep.media !== "") {
      const type = replyStep.mediaType || "image"; // default to image
      body.type = type;
      
      body[type] = {
        link: replyStep.media,
        caption: replyStep.text || "" // Media එක්ක යවන Text එක Caption වෙනවා
      };

      // Document එකක් නම් Filename එක ඕනේ
      if (type === "document" && replyStep.fileName) {
         body[type].filename = replyStep.fileName;
      }

    } else {
      // Text විතරක් නම්
      body.type = "text";
      body.text = { body: replyStep.text };
    }

    await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

  } catch (error) {
    console.error("WhatsApp Send Failed:", error.response ? error.response.data : error.message);
  }
};

module.exports = router;