const router = require("express").Router();
const axios = require("axios");
const mongoose = require("mongoose");
const FormData = require("form-data"); // 🔥 REQUIRED FOR CLOUDINARY UPLOAD
const User = require("../models/User");
const Contact = require("../models/Contact");
const Message = require("../models/Message");
const BotConfig = require("../models/BotConfig");
const ChatSession = require("../models/ChatSession");

// 🔥 CONFIGURATIONS
const SESSION_TIMEOUT = 3 * 24 * 60 * 60 * 1000; // 3 Days
const MESSAGE_COOLDOWN = 2000; // 🔥 2 Seconds Cooldown (Bot එක පැටලෙන්නේ නැති වෙන්න වේගෙන් එන මැසේජ් Ignore කරනවා)
const BOT_TYPING_DELAY = 1500; // 🔥 1.5 Seconds Delay (Bot හිතලා යවනවා වගේ පේන්න)

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

// 🔥 1.1 CRON JOB PING ROUTE (මේක තමයි Cron Job එකට දෙන Link එක)
// මේකට Request එකක් ආවම Server එක ඇහැරෙනවා.
router.get("/ping", (req, res) => {
    console.log("🔔 Keep-Alive Ping Received - Preventing Cold Boot");
    res.status(200).send("Pong! Server is Awake 🚀");
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

          // 🔥 Status Updates Logging (Sent, Delivered, Read ignore කරනවා)
          if (value.statuses && value.statuses.length > 0) {
             const statusObj = value.statuses[0];
             const status = statusObj.status;
             
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
            // PART A: MEDIA HANDLING
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

                if (mediaId) {
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
            if (contact.assignedTo) contact.callStatus = "Pending"; 
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
              mediaUrl: mediaUrl 
            });

            // ---------------------------------------------------------
            // PART D: BOT LOGIC (WITH DELAY & BURST HANDLING)
            // ---------------------------------------------------------
            const botConfig = await BotConfig.findOne({ ownerId: client._id });

            if (botConfig && botConfig.isActive && botConfig.replies && botConfig.replies.length > 0) {
                let session = await ChatSession.findOne({ userId: client._id, phoneNumber: from });
                
                if (!session) {
                    session = new ChatSession({ userId: client._id, phoneNumber: from, currentStep: 0, lastActive: Date.now() });
                }

                const currentTime = Date.now();
                const lastActiveTime = new Date(session.lastActive).getTime();
                const timeDiff = currentTime - lastActiveTime;

                // 1. TIMEOUT RESET
                if (timeDiff > SESSION_TIMEOUT) {
                    console.log(`⏳ Session Timeout for ${from}. Resetting Bot.`);
                    session.currentStep = 0; 
                }

                // 🔥 2. SPAM PROTECTION (BURST HANDLING)
                // මැසේජ් දෙකක් අතර තත්පර 2ක පරතරයක් නැත්නම්, අපි අලුත් මැසේජ් එක Ignore කරනවා.
                // මේකෙන් Bot එක දිගට පියවර පැනීම නවතිනවා.
                if (timeDiff < MESSAGE_COOLDOWN && session.currentStep > 0) {
                    console.log(`🚦 Burst Protection: Ignoring rapid message from ${from}`);
                    continue; 
                }

                // 🔥 3. LOCK SESSION (Update Time)
                session.lastActive = Date.now(); 
                await session.save();

                // 4. CHECK KEYWORD RESET
                const lowerMsg = (msgObj.text?.body || "").toLowerCase();
                if (lowerMsg.includes("hi") || lowerMsg.includes("start") || lowerMsg.includes("menu")) {
                    console.log(`🔄 RESET TRIGGERED by keyword: "${msgBody}"`);
                    session.currentStep = 0; 
                }

                // 5. SEND REPLY (WITH DELAY)
                if (session.currentStep < botConfig.replies.length) {
                    const replyToSend = botConfig.replies[session.currentStep];
                    
                    // 🔥 ARTIFICIAL DELAY (Typing Effect)
                    // මේකෙන් Bot එක තත්පර 1.5ක් ඉඳලා තමයි රිප්ලයි කරන්නේ.
                    setTimeout(async () => {
                        await sendWhatsAppMessage(client, from, replyToSend);

                        await Message.create({
                            contactId: contact._id,
                            text: replyToSend.text || (replyToSend.media ? "Bot Media" : "Bot Reply"),
                            sender: "me",
                            ownerId: client._id,
                            isBotReply: true
                        });
                    }, BOT_TYPING_DELAY);

                    session.currentStep += 1;
                    // Update time again inside timeout usually, but here fine for flow
                    session.lastActive = Date.now(); 
                    await session.save();
                } else {
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

// Helper: Send Message (FIXED FOR VIDEO & AUDIO PLAYBACK)
const sendWhatsAppMessage = async (client, to, replyStep) => {
  try {
    const url = `https://graph.facebook.com/v17.0/${client.whatsappConfig.phoneNumberId}/messages`;
    const token = client.whatsappConfig.accessToken;

    let body = { messaging_product: "whatsapp", recipient_type: "individual", to: to };

    if (replyStep.media && replyStep.media !== "") {
      let type = replyStep.mediaType || "image";
      
      // Safety Check
      if (replyStep.media.includes("/video/")) {
          type = "video";
      } else if (replyStep.media.includes("/audio/") || replyStep.media.endsWith(".mp3") || replyStep.media.endsWith(".wav")) {
          type = "audio";
      } else if (replyStep.media.endsWith(".pdf") || replyStep.media.includes("/raw/")) {
          type = "document";
      }

      body.type = type;
      
      // --- VIDEO ---
      if (type === "video") {
          let videoUrl = replyStep.media;
          if (!videoUrl.endsWith(".mp4")) { videoUrl = videoUrl + ".mp4"; }
          body.video = { link: videoUrl, caption: replyStep.text || "" };
      } 
      // --- AUDIO (New Fix) ---
      else if (type === "audio") {
          let audioUrl = replyStep.media;
          if (!audioUrl.endsWith(".mp3")) { audioUrl = audioUrl + ".mp3"; }
          body.audio = { link: audioUrl }; // Audio walata caption danna ba
      }
      // --- DOC ---
      else if (type === "document") {
          body.document = { link: replyStep.media, caption: replyStep.text || "", filename: replyStep.fileName || "File.pdf" };
      }
      // --- IMAGE ---
      else {
          body.image = { link: replyStep.media, caption: replyStep.text || "" };
      }

    } else {
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