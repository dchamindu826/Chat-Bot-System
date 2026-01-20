const router = require("express").Router();
const axios = require("axios");
const mongoose = require("mongoose");
const FormData = require("form-data"); // 🔥 REQUIRED FOR CLOUDINARY UPLOAD
const User = require("../models/User");
const Contact = require("../models/Contact");
const Message = require("../models/Message");
const BotConfig = require("../models/BotConfig");
const ChatSession = require("../models/ChatSession");

// 🔥 NEW: Session Timeout Config (3 Days = 72 Hours)
const SESSION_TIMEOUT = 3 * 24 * 60 * 60 * 1000; 

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
        const urlRes = await axios.get(`https://graph.facebook.com/v17.0/${mediaId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const fbUrl = urlRes.data.url;

        const mediaRes = await axios.get(fbUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
            responseType: 'arraybuffer' 
        });
        const buffer = Buffer.from(mediaRes.data);

        const formData = new FormData();
        formData.append('file', buffer, { filename: 'media_file' }); 
        formData.append('upload_preset', 'Chat Bot System'); 
        formData.append('cloud_name', 'dyixoaldi'); 

        const uploadRes = await axios.post(
            `https://api.cloudinary.com/v1_1/dyixoaldi/auto/upload`, 
            formData,
            { headers: { ...formData.getHeaders() } }
        );

        console.log("✅ Cloudinary Upload Success:", uploadRes.data.secure_url);
        return uploadRes.data.secure_url; 

    } catch (error) {
        console.error("❌ Media Upload Error:", error.message);
        return null;
    }
};

// 1. VERIFICATION ROUTE
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

// 2. MESSAGE HANDLING ROUTE
router.post("/", async (req, res) => {
  res.status(200).send("EVENT_RECEIVED");

  try {
    await connectDB();
    const body = req.body;

    if (body.object === "whatsapp_business_account") {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;

          // 🔥 Status Updates Logging
          if (value.statuses && value.statuses.length > 0) {
             const statusObj = value.statuses[0];
             const status = statusObj.status;
             const phone = statusObj.recipient_id;
             
             console.log(`📉 Status Update for ${phone}: ${status}`);
             
             if (status === "failed") {
                 console.error("❌ Delivery Failed Reason:", JSON.stringify(statusObj.errors, null, 2));
             }
             continue; 
          }

          if (value.messages && value.messages.length > 0) {
            const phone_number_id = value.metadata.phone_number_id;
            const msgObj = value.messages[0];
            const from = msgObj.from;
            const msgType = msgObj.type; 

            // 1. Client Find
            const client = await User.findOne({ "whatsappConfig.phoneNumberId": phone_number_id });
            if (!client) {
                console.error("❌ ERROR: No Client found for this Phone ID!");
                continue; 
            }

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
                    console.log(`⏳ Processing ${msgType}...`);
                    mediaUrl = await processMedia(mediaId, client.whatsappConfig.accessToken);
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
                    session = new ChatSession({ userId: client._id, phoneNumber: from, currentStep: 0, lastActive: Date.now() });
                }

                // 1. CHECK TIME GAP
                const currentTime = Date.now();
                const lastActiveTime = new Date(session.lastActive).getTime();
                const timeDiff = currentTime - lastActiveTime;

                if (timeDiff > SESSION_TIMEOUT) {
                    console.log(`⏳ Session Timeout for ${from}. Resetting Bot.`);
                    session.currentStep = 0; 
                }

                // 2. CHECK KEYWORD RESET
                const lowerMsg = (msgObj.text?.body || "").toLowerCase();
                if (lowerMsg.includes("hi") || lowerMsg.includes("start") || lowerMsg.includes("menu")) {
                    console.log(`🔄 RESET TRIGGERED by keyword: "${msgBody}"`);
                    session.currentStep = 0; 
                }

                // 3. SEND REPLY
                if (session.currentStep < botConfig.replies.length) {
                    const replyToSend = botConfig.replies[session.currentStep];
                    await sendWhatsAppMessage(client, from, replyToSend);

                    await Message.create({
                        contactId: contact._id,
                        text: replyToSend.text || (replyToSend.media ? "Bot Media" : "Bot Reply"),
                        sender: "me",
                        ownerId: client._id,
                        isBotReply: true
                    });

                    session.currentStep += 1;
                    session.lastActive = Date.now();
                    await session.save();
                } else {
                    session.lastActive = Date.now();
                    await session.save();
                    console.log(`🚫 STOPPED: All steps finished for ${from}.`);
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

// Helper: Send Message (🔥 FIXED FOR VIDEO & AUDIO PLAYBACK)
const sendWhatsAppMessage = async (client, to, replyStep) => {
  try {
    const url = `https://graph.facebook.com/v17.0/${client.whatsappConfig.phoneNumberId}/messages`;
    const token = client.whatsappConfig.accessToken;

    let body = { messaging_product: "whatsapp", recipient_type: "individual", to: to };

    if (replyStep.media && replyStep.media !== "") {
      // Default type set karamu
      let type = replyStep.mediaType || "image";
      
      // Safety Check: Cloudinary URL eken type eka hariyatama ganna
      if (replyStep.media.includes("/video/")) {
          type = "video";
      } else if (replyStep.media.includes("/audio/") || replyStep.media.endsWith(".mp3") || replyStep.media.endsWith(".wav")) {
          type = "audio";
      } else if (replyStep.media.endsWith(".pdf") || replyStep.media.includes("/raw/")) {
          type = "document";
      }

      body.type = type;
      
      // --- VIDEO HANDLING ---
      if (type === "video") {
          let videoUrl = replyStep.media;
          // Cloudinary Video URL ekata .mp4 kalla balen danna one play wenna
          if (!videoUrl.endsWith(".mp4")) {
              videoUrl = videoUrl + ".mp4"; 
          }
          body.video = { link: videoUrl, caption: replyStep.text || "" };
      } 
      // --- AUDIO HANDLING (New Fix) ---
      else if (type === "audio") {
          let audioUrl = replyStep.media;
          // Cloudinary Audio URL ekata .mp3 danna
          if (!audioUrl.endsWith(".mp3")) {
              audioUrl = audioUrl + ".mp3"; 
          }
          // Audio walata caption danna ba whatsapp wala
          body.audio = { link: audioUrl };
      }
      // --- DOCUMENT HANDLING ---
      else if (type === "document") {
          body.document = {
            link: replyStep.media,
            caption: replyStep.text || "",
            filename: replyStep.fileName || "File.pdf"
          };
      }
      // --- IMAGE HANDLING ---
      else {
          body.image = {
            link: replyStep.media,
            caption: replyStep.text || ""
          };
      }

    } else {
      // Text Message
      body.type = "text";
      body.text = { body: replyStep.text };
    }

    await axios.post(url, body, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
    console.log(`✅ Message Sent to ${to} (Type: ${body.type})`);

  } catch (error) {
    console.error("❌ Bot Send Failed:", error.response ? error.response.data : error.message);
  }
};

module.exports = router;