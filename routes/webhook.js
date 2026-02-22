const router = require("express").Router();
const axios = require("axios");
const mongoose = require("mongoose");
const FormData = require("form-data");
const User = require("../models/User");
const Contact = require("../models/Contact");
const Message = require("../models/Message");
const BotConfig = require("../models/BotConfig");
const ChatSession = require("../models/ChatSession");

// 🔥 CONFIGURATIONS
const SESSION_TIMEOUT = 3 * 24 * 60 * 60 * 1000; 
const MESSAGE_COOLDOWN = 0; // Speed Mode (No Cooldown)
// const BOT_TYPING_DELAY = 0; // Speed Mode (No Delay)

// DB Connection
let isConnected = false;
const connectDB = async () => {
  if (isConnected) return;
  try {
    await mongoose.connect(process.env.MONGO_URL || process.env.MONGO_URI);
    isConnected = true;
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("❌ DB Error:", error);
  }
};

// Cloudinary Uploader
const processMedia = async (mediaId, accessToken) => {
    try {
        const urlRes = await axios.get(`https://graph.facebook.com/v17.0/${mediaId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
        const mediaRes = await axios.get(urlRes.data.url, { headers: { Authorization: `Bearer ${accessToken}` }, responseType: 'arraybuffer' });
        const formData = new FormData();
        formData.append('file', Buffer.from(mediaRes.data), { filename: 'media_file' }); 
        formData.append('upload_preset', 'Chat Bot System'); 
        formData.append('cloud_name', 'dyixoaldi'); 
        const uploadRes = await axios.post(`https://api.cloudinary.com/v1_1/dyixoaldi/auto/upload`, formData, { headers: { ...formData.getHeaders() } });
        return uploadRes.data.secure_url; 
    } catch (error) { return null; }
};

// 1. Verification
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token && mode === "subscribe" && token === (process.env.VERIFY_TOKEN || "mysecrettoken")) {
      res.status(200).send(challenge);
  } else { res.sendStatus(403); }
});

// 2. Ping
router.get("/ping", (req, res) => { res.status(200).send("Pong!"); });

// 3. Message Handling
router.post("/", async (req, res) => {
  const startTime = Date.now(); // ⏱️ Time මනින්න පටන් ගන්නවා
  console.log(`[${new Date().toISOString()}] 🔥 WEBHOOK RECEIVED:`, JSON.stringify(req.body, null, 2));
  res.status(200).send("EVENT_RECEIVED");
  try {
    await connectDB();
    const body = req.body;
    if (body.object === "whatsapp_business_account") {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;

          // 🔥 UPDATED: Error Logging for Failed Messages
          if (value.statuses) {
             const statusObj = value.statuses[0];
             if (statusObj.status === "failed") {
                 console.error(`❌ WhatsApp Error for ${statusObj.recipient_id}:`, JSON.stringify(statusObj.errors));
             }
             continue; 
          }

          if (value.messages && value.messages.length > 0) {
            const msgObj = value.messages[0];
            const from = msgObj.from;
            const msgType = msgObj.type; 
            const phone_number_id = value.metadata.phone_number_id;

            const client = await User.findOne({ "whatsappConfig.phoneNumberId": phone_number_id });
            if (!client) continue; 

            // Save Incoming Message
            let msgBody = "Media File";
            let mediaUrl = null;
            if (msgType === "text") msgBody = msgObj.text.body;
            else if (["image", "video", "audio", "document", "voice"].includes(msgType)) {
                msgBody = msgObj[msgType].caption || `📷 ${msgType} Received`;
                if (msgObj[msgType].id) mediaUrl = await processMedia(msgObj[msgType].id, client.whatsappConfig.accessToken);
            }

            let contact = await Contact.findOne({ phoneNumber: from, ownerId: client._id });
            if (!contact) contact = new Contact({ phoneNumber: from, ownerId: client._id, name: `Guest ${from.slice(-4)}` });
            
            contact.lastMessage = msgBody;
            contact.lastMessageTime = new Date();
            contact.unreadCount = (contact.unreadCount || 0) + 1;
            await contact.save();

            await Message.create({ contactId: contact._id, text: msgBody, sender: "customer", ownerId: client._id, type: msgType === 'voice' ? 'audio' : msgType, mediaUrl: mediaUrl });

            // Bot Logic
            const botConfig = await BotConfig.findOne({ ownerId: client._id });
            if (botConfig && botConfig.isActive && botConfig.replies.length > 0) {
                let session = await ChatSession.findOne({ userId: client._id, phoneNumber: from });
                if (!session) session = new ChatSession({ userId: client._id, phoneNumber: from, currentStep: 0, lastActive: Date.now() });

                if ((Date.now() - new Date(session.lastActive).getTime()) > SESSION_TIMEOUT) session.currentStep = 0; 
                if ((msgObj.text?.body || "").toLowerCase().match(/hi|start|menu/)) session.currentStep = 0;

                if (session.currentStep < botConfig.replies.length) {
                    const reply = botConfig.replies[session.currentStep];
                    
                    console.log(`⏱️ DB Queries වලට ගිය වෙලාව: ${Date.now() - startTime}ms`);
                    
                    await sendWhatsAppMessage(client, from, reply);
                    await Message.create({ contactId: contact._id, text: reply.text || "Bot Reply", sender: "me", ownerId: client._id, isBotReply: true });

                    console.log(`⏱️ සම්පූර්ණ Process එකට ගිය වෙලාව: ${Date.now() - startTime}ms`);

                    session.currentStep += 1;
                    session.lastActive = Date.now();
                    await session.save();
                } else {
                    session.lastActive = Date.now();
                    await session.save();
                }
            }
          }
        }
      }
    }
  } catch (err) { console.error("Webhook Error:", err.message); }
});

// 🔥 Helper: Send Message (DEBUG VERSION)
const sendWhatsAppMessage = async (client, to, replyStep) => {
  try {
    const url = `https://graph.facebook.com/v17.0/${client.whatsappConfig.phoneNumberId}/messages`;
    const token = client.whatsappConfig.accessToken;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    
    let body = { messaging_product: "whatsapp", recipient_type: "individual", to: to };

    if (replyStep.media && replyStep.media.trim() !== "") {
      let type = replyStep.mediaType || "image";
      let mediaLink = replyStep.media.trim();

      // Auto-detect type
      if (!type || type === 'file') {
          if (mediaLink.match(/\.(mp3|wav|ogg)$/i)) type = "audio";
          else if (mediaLink.match(/\.(mp4|mov|avi)$/i)) type = "video";
          else if (mediaLink.includes("/video/") && !mediaLink.includes("/audio/")) type = "video"; 
      }

      body.type = type;

      if (type === "audio") {
          if (!mediaLink.toLowerCase().endsWith(".mp3") && !mediaLink.includes("?")) mediaLink += ".mp3";
          body.audio = { link: mediaLink };
          
          await axios.post(url, body, { headers });
          
          if (replyStep.text && replyStep.text.trim() !== "") {
              const textBody = { 
                  messaging_product: "whatsapp", recipient_type: "individual", to: to, type: "text", text: { body: replyStep.text } 
              };
              await axios.post(url, textBody, { headers });
          }
          return;
      }
      else if (type === "video") {
          
          console.log("🎥 Original Video Link:", mediaLink);

          // 🔥 CLEAN VERSION: No Cloudinary Transformations
          // Video eka api manual convert karala upload karamu.
          
          // Extension eka nethnam witharak dagannawa safety ekata
          if (!mediaLink.toLowerCase().endsWith(".mp4") && !mediaLink.includes("?")) {
              mediaLink += ".mp4";
          }
          
          console.log("🚀 Sending Direct Link:", mediaLink);

          body.video = { link: mediaLink, caption: replyStep.text || "" };
      }
      else if (type === "document") {
          body.document = { link: mediaLink, caption: replyStep.text || "", filename: replyStep.fileName || "File.pdf" };
      }
      else {
          body.image = { link: mediaLink, caption: replyStep.text || "" };
      }
    } else {
      body.type = "text";
      body.text = { body: replyStep.text };
    }

    // Send Request
    const res = await axios.post(url, body, { headers });
    console.log(`✅ Message Sent to ${to} | ID: ${res.data.messages[0].id}`);

  } catch (error) { 
      console.error("❌ Bot Send Failed Details:", error.response ? JSON.stringify(error.response.data) : error.message); 
  }
};

module.exports = router;