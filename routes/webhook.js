const router = require("express").Router();
const axios = require("axios");
const supabase = require("../supabase");
const FormData = require("form-data");

const SESSION_TIMEOUT = 3 * 24 * 60 * 60 * 1000;
const CLOUD_NAME = "dyixoaldi";
const UPLOAD_PRESET = "Chat Bot System";

// 🔥 1. ANTI-LOOP CACHE: එකම Message ID එක දෙපාරක් එන එක නවත්වන්න
const processedMessageIds = new Set();
// 🔥 2. COOLDOWN TIMER: තත්පර 5ක් ඇතුළත එකම නම්බර් එකෙන් එන මැසේජ් නවත්වන්න
const userCooldowns = new Map();

router.get("/", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token && mode === "subscribe" && token === (process.env.META_VERIFY_TOKEN || "mysecrettoken")) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

const getMediaUrlFromMeta = async (mediaId, accessToken) => {
    try {
        const response = await axios.get(`https://graph.facebook.com/v17.0/${mediaId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        return response.data.url;
    } catch (err) {
        return null;
    }
};

const uploadMediaToCloudinary = async (mediaUrl, accessToken) => {
    try {
        const response = await axios.get(mediaUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
            responseType: 'arraybuffer' 
        });

        const formData = new FormData();
        const buffer = Buffer.from(response.data, 'binary');
        
        formData.append("file", buffer, { filename: "downloaded_media" });
        formData.append("upload_preset", UPLOAD_PRESET);

        const cloudRes = await axios.post(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, formData, {
            headers: { ...formData.getHeaders() }
        });

        return cloudRes.data.secure_url;
    } catch (error) {
        return null;
    }
};

// 🔥 UPDATED: මැසේජ් එක යවලා ඒකෙ ID එක Return කරන්න Function එක හැදුවා
const sendWhatsAppMessage = async (client, to, replyStep) => {
    try {
        const url = `https://graph.facebook.com/v17.0/${client.phone_number_id}/messages`;
        const headers = { Authorization: `Bearer ${client.access_token}`, "Content-Type": "application/json" };

        let body = { messaging_product: "whatsapp", recipient_type: "individual", to: to };

        if (replyStep.mediaType && replyStep.mediaType !== 'text' && replyStep.media) {
            body.type = replyStep.mediaType;
            body[replyStep.mediaType] = { link: replyStep.media };
            if (replyStep.text && replyStep.mediaType !== 'audio') {
                body[replyStep.mediaType].caption = replyStep.text;
            }
        } else {
            body.type = "text";
            body.text = { body: replyStep.text };
        }

        const response = await axios.post(url, body, { headers });
        // 🔥 NEW: Return message ID
        return response.data.messages?.[0]?.id || null;
    } catch (error) {
        console.error("Bot Reply send error:", error.message);
        return null;
    }
};

router.post("/", async (req, res) => {
    // Meta එකට ඉක්මනින් 200 OK යවන්න (නැත්නම් ඒගොල්ලෝ දිගටම Retry කරනවා)
    res.status(200).send("EVENT_RECEIVED");

    try {
        const body = req.body;
        if (body.object === "whatsapp_business_account") {
            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    const value = change.value;

                    // 🔥 ඉතා වැදගත්: Status Updates (Delivery reports, Echoes) මඟ හරින්න
                    if (value.statuses) continue;

                    if (value.messages && value.messages.length > 0) {
                        const msgObj = value.messages[0];
                        const msgId = msgObj.id; 
                        const from = msgObj.from; 

                        // 🛑 BLOCK 1: එකම මැසේජ් එක දෙපාරක් ආවොත් නවත්වන්න
                        if (msgId && processedMessageIds.has(msgId)) {
                            console.log(`🛑 Blocked Meta Retry ID: ${msgId}`);
                            continue;
                        }
                        if (msgId) {
                            processedMessageIds.add(msgId);
                            setTimeout(() => processedMessageIds.delete(msgId), 10 * 60 * 1000);
                        }

                        // 🛑 BLOCK 2: Cooldown Timer (තත්පර 5ක් ඇතුළත ආයේ ආවොත් නවත්වන්න)
                        const now = Date.now();
                        const lastActivity = userCooldowns.get(from) || 0;
                        if (now - lastActivity < 5000) {
                            console.log(`🛑 Blocked by Cooldown Timer for ${from}.`);
                            continue;
                        }
                        userCooldowns.set(from, now);

                        const msgType = msgObj.type; 
                        const phone_number_id = value.metadata.phone_number_id; 
                        const display_phone_number = value.metadata.display_phone_number; 

                        // 🛑 BLOCK 3: Bot ගේම අංකයෙන් එන ඒවට (Echoes) Auto Reply යන එක නවත්වන්න
                        const sanitizedBotNum = display_phone_number ? display_phone_number.replace(/\D/g, '') : '';
                        if (from === sanitizedBotNum || (sanitizedBotNum && from.includes(sanitizedBotNum))) {
                            continue;
                        }

                        // 🛑 BLOCK 4: System සහ Unknown Type Messages වලට Auto Reply යවන්න එපා (Templates යනකොට එන්නේ මේවා)
                        if (msgType === 'system' || msgType === 'unknown' || msgType === 'unsupported') {
                            continue;
                        }

                        console.log(`📩 Incoming message from: ${from}`);

                        const { data: clients } = await supabase.from('users').select('*').eq('phone_number_id', phone_number_id).limit(1);
                        const client = clients && clients.length > 0 ? clients[0] : null;

                        if (!client) continue;

                        let msgBody = ""; 
                        let lastMessageText = ""; 
                        let finalMediaUrl = null;

                        if (msgType === "text") {
                            msgBody = msgObj.text.body;
                            lastMessageText = msgBody;
                        } else if (msgType === "button") {
                            msgBody = msgObj.button.text;
                            lastMessageText = msgBody;
                        } else if (msgType === "interactive") {
                            msgBody = msgObj.interactive.button_reply?.title || msgObj.interactive.list_reply?.title || "Interactive Reply";
                            lastMessageText = msgBody;
                        } else if (["image", "video", "audio", "document", "sticker"].includes(msgType)) {
                            const mediaObj = msgObj[msgType];
                            const mediaId = mediaObj.id;
                            msgBody = mediaObj.caption || ""; 
                            
                            const icons = { image: "📷 Image", video: "🎥 Video", audio: "🎤 Voice", document: "📄 Document", sticker: "🎭 Sticker" };
                            lastMessageText = mediaObj.caption || icons[msgType] || `📎 Attachment`;
                            
                            const metaMediaUrl = await getMediaUrlFromMeta(mediaId, client.access_token);
                            if (metaMediaUrl) finalMediaUrl = await uploadMediaToCloudinary(metaMediaUrl, client.access_token);
                        } else {
                            msgBody = "";
                            lastMessageText = `📎 ${msgType}`;
                        }

                        // DB Contact Update
                        let { data: contacts } = await supabase.from('contacts').select('*').eq('phone_number', from).eq('owner_id', client.id).limit(1);
                        let contact = contacts && contacts.length > 0 ? contacts[0] : null;

                        if (!contact) {
                            const { data: newContacts } = await supabase.from('contacts').insert([{
                                phone_number: from, owner_id: client.id, name: `Guest ${from.slice(-4)}`, unread_count: 1
                            }]).select().limit(1);
                            contact = newContacts && newContacts.length > 0 ? newContacts[0] : null;
                        } else {
                            await supabase.from('contacts').update({
                                last_message: lastMessageText,
                                last_message_time: new Date().toISOString(),
                                unread_count: (contact.unread_count || 0) + 1
                            }).eq('id', contact.id);
                        }

                        if (!contact) continue;

                        // Save Incoming Message to Database
                        await supabase.from('messages').insert([{
                            contact_id: contact.id,
                            owner_id: client.id,
                            text: msgBody, 
                            sender: "customer",
                            type: msgType,
                            media_url: finalMediaUrl,
                            whatsapp_message_id: msgId // 🔥 NEW: ළමයා එවපු මැසේජ් එකේ ID එක Save කළා
                        }]);

                        // 🤖 BOT AUTO-REPLY LOGIC
                        const { data: botConfigs } = await supabase.from('bot_configs').select('*').eq('owner_id', client.id).limit(1);
                        const botConfig = botConfigs && botConfigs.length > 0 ? botConfigs[0] : null;

                        if (botConfig && botConfig.is_active && botConfig.replies && botConfig.replies.length > 0) {
                            let { data: sessions } = await supabase.from('chat_sessions').select('*').eq('user_id', client.id).eq('phone_number', from).limit(1);
                            let session = sessions && sessions.length > 0 ? sessions[0] : null;

                            if (!session) {
                                const { data: newSessions } = await supabase.from('chat_sessions').insert([{ user_id: client.id, phone_number: from, current_step: 0 }]).select().limit(1);
                                session = newSessions && newSessions.length > 0 ? newSessions[0] : null;
                            }

                            let currentStep = session.current_step;
                            if ((now - new Date(session.last_active).getTime()) > SESSION_TIMEOUT) currentStep = 0;
                            if (msgType === 'text' && (msgBody.toLowerCase() === 'hi' || msgBody.toLowerCase() === 'start')) currentStep = 0;

                            if (currentStep < botConfig.replies.length) {
                                const reply = botConfig.replies[currentStep];

                                // 🔥 RACE-CONDITION FIX: මැසේජ් එක යවන්න කලින් Step එක අනිවාර්යයෙන්ම Update කරනවා
                                await supabase.from('chat_sessions')
                                    .update({ current_step: currentStep + 1, last_active: new Date(now).toISOString() })
                                    .eq('id', session.id);

                                // 🔥 NEW: Bot යවපු මැසේජ් එකේ ID එක ගන්නවා
                                const botMsgId = await sendWhatsAppMessage(client, from, reply);

                                // Save Bot Message to Database
                                await supabase.from('messages').insert([{
                                    contact_id: contact.id,
                                    owner_id: client.id,
                                    text: reply.text || "Bot Media",
                                    sender: "me",
                                    direction: "outbound",
                                    is_bot_reply: true,
                                    type: reply.mediaType || 'text',
                                    media_url: reply.media || null,
                                    whatsapp_message_id: botMsgId // 🔥 NEW: Bot එවපු මැසේජ් එකේ ID එකත් Save කළා
                                }]);
                            }
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error("Webhook Error: ", err.message);
    }
});

module.exports = router;