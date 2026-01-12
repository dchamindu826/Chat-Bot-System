const router = require("express").Router();
const axios = require("axios");
const mongoose = require("mongoose");
const FormData = require("form-data"); // 🔥 MEKA ONAMA KRNWA
const User = require("../models/User");
const Contact = require("../models/Contact");
const Message = require("../models/Message");
const BotConfig = require("../models/BotConfig");
const ChatSession = require("../models/ChatSession");

// DB Connection
const connectDB = async () => {
  try {
    if (mongoose.connection.readyState === 1) return;
    await mongoose.connect(process.env.MONGO_URL || process.env.MONGO_URI);
    console.log("✅ MongoDB Re-Connected inside Webhook");
  } catch (error) {
    console.error("❌ DB Connection Error:", error);
  }
};

// 🔥 SUPER FUNCTION: Download from Facebook -> Upload to Cloudinary
const processMedia = async (mediaId, accessToken) => {
    try {
        // 1. Get the URL from Facebook
        const urlRes = await axios.get(`https://graph.facebook.com/v17.0/${mediaId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const fbUrl = urlRes.data.url;

        // 2. Download the binary data (Buffer)
        const mediaRes = await axios.get(fbUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
            responseType: 'arraybuffer' 
        });
        const buffer = Buffer.from(mediaRes.data);

        // 3. Upload to Cloudinary (Using your credentials)
        const formData = new FormData();
        formData.append('file', buffer, { filename: 'media_file' }); 
        formData.append('upload_preset', 'Chat Bot System'); // Frontend eke thibba preset eka
        formData.append('cloud_name', 'dyixoaldi'); // Frontend eke thibba cloud name eka

        const uploadRes = await axios.post(
            `https://api.cloudinary.com/v1_1/dyixoaldi/auto/upload`, 
            formData,
            { headers: { ...formData.getHeaders() } }
        );

        return uploadRes.data.secure_url; // Public Link eka denawa

    } catch (error) {
        console.error("❌ Media Upload Error:", error.message);
        return null;
    }
};

// 1. VERIFICATION
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

// 2. MESSAGE HANDLING
router.post("/", async (req, res) => {
  res.status(200).send("EVENT_RECEIVED");

  try {
    await connectDB();
    const body = req.body;

    if (body.object === "whatsapp_business_account") {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;

          if (value.messages && value.messages.length > 0) {
            const phone_number_id = value.metadata.phone_number_id;
            const msgObj = value.messages[0];
            const from = msgObj.from;
            const msgType = msgObj.type; 

            // 1. Client Find
            const client = await User.findOne({ "whatsappConfig.phoneNumberId": phone_number_id });
            if (!client) continue;

            // ---------------------------------------------------------
            // PART A: MEDIA HANDLING (CLOUD UPLOAD)
            // ---------------------------------------------------------
            let msgBody = "Media File";
            let mediaUrl = null;

            if (msgType === "text") {
                msgBody = msgObj.text.body;
            } 
            else if (["image", "video", "audio", "document", "voice", "sticker"].includes(msgType)) {
                
                const mediaObj = msgObj[msgType];
                const mediaId = mediaObj?.id;
                const caption = mediaObj?.caption || "";
                
                msgBody = caption || `📷 ${msgType.charAt(0).toUpperCase() + msgType.slice(1)} Received`;

                // 🔥 Process Media: FB -> Cloudinary
                if (mediaId) {
                    console.log("⏳ Processing Media...");
                    mediaUrl = await processMedia(mediaId, client.whatsappConfig.accessToken);
                    console.log("✅ Media Uploaded:", mediaUrl);
                }
            }

            // ---------------------------------------------------------
            // PART B: CONTACT UPDATE
            // ---------------------------------------------------------
            let contact = await Contact.findOne({ phoneNumber: from, ownerId: client._id });
            
            if (!contact) {
              contact = new Contact({
                phoneNumber: from,
                ownerId: client._id,
                name: `Guest ${from.slice(-4)}`,
                callStatus: "Pending",
                priority: "Low",
                messageCount: 0,
                unreadCount: 0
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
            contact.unreadCount = (contact.unreadCount || 0) + 1;
            
            if (contact.assignedTo) {
                contact.callStatus = "Pending"; 
            }
            
            await contact.save();

            // ---------------------------------------------------------
            // PART C: SAVE MESSAGE
            // ---------------------------------------------------------
            await Message.create({
              contactId: contact._id,
              text: msgBody,
              sender: "customer",
              ownerId: client._id,
              type: msgType === 'voice' ? 'audio' : msgType, 
              mediaUrl: mediaUrl // 🔥 Save Public Cloudinary Link
            });

            // ---------------------------------------------------------
            // PART D: BOT LOGIC
            // ---------------------------------------------------------
            const botConfig = await BotConfig.findOne({ ownerId: client._id });

            if (botConfig && botConfig.isActive && botConfig.replies && botConfig.replies.length > 0) {
                let session = await ChatSession.findOne({ userId: client._id, phoneNumber: from });
                if (!session) {
                    session = new ChatSession({ userId: client._id, phoneNumber: from, currentStep: 0 });
                }

                const lowerMsg = (msgObj.text?.body || "").toLowerCase();
                if (lowerMsg.includes("hi") || lowerMsg.includes("start")) {
                    session.currentStep = 0; 
                }

                if (session.currentStep < botConfig.replies.length) {
                    const replyToSend = botConfig.replies[session.currentStep];
                    await sendWhatsAppMessage(client, from, replyToSend);

                    await Message.create({
                        contactId: contact._id,
                        text: replyToSend.text || "Bot Reply",
                        sender: "me",
                        ownerId: client._id,
                        isBotReply: true
                    });

                    session.currentStep += 1;
                    session.lastActive = Date.now();
                    await session.save();
                }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("❌ Webhook Error:", err.message);
  }
});

// Helper: Send Message
const sendWhatsAppMessage = async (client, to, replyStep) => {
  try {
    const url = `https://graph.facebook.com/v17.0/${client.whatsappConfig.phoneNumberId}/messages`;
    const token = client.whatsappConfig.accessToken;

    let body = { messaging_product: "whatsapp", recipient_type: "individual", to: to };

    if (replyStep.media) {
      const type = replyStep.mediaType || "image";
      body.type = type;
      body[type] = { link: replyStep.media, caption: replyStep.text || "" };
    } else {
      body.type = "text";
      body.text = { body: replyStep.text };
    }

    await axios.post(url, body, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("❌ Bot Send Failed:", error.message);
  }
};

module.exports = router;