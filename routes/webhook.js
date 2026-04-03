const router = require("express").Router();
const axios = require("axios");
const supabase = require("../supabase");
const FormData = require("form-data");

const SESSION_TIMEOUT = 3 * 24 * 60 * 60 * 1000;
const CLOUD_NAME = "dyixoaldi";
const UPLOAD_PRESET = "Chat Bot System";

// 🔥 1. ANTI-LOOP CACHE
const processedMessageIds = new Set();
// 🔥 2. COOLDOWN TIMER
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
        return response.data.messages?.[0]?.id || null;
    } catch (error) {
        console.error("❌ Bot Reply send error:", error.response ? error.response.data : error.message);
        return null;
    }
};

router.post("/", async (req, res) => {
    res.status(200).send("EVENT_RECEIVED");

    try {
        const body = req.body;
        if (body.object === "whatsapp_business_account") {
            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    const value = change.value;

                    // 🔥 NEW: Status Updates අල්ලන කොටස
                    if (value.statuses && value.statuses.length > 0) {
                        const statusObj = value.statuses[0];
                        console.log(`\n[WEBHOOK STATUS] Msg ID: ${statusObj.id} | Status: ${statusObj.status}`);
                        
                        // Error එකක් ආවොත් ඒක පැහැදිලිව පෙන්නනවා
                        if (statusObj.errors && statusObj.errors.length > 0) {
                            console.error(`🔥 META DELIVERY ERROR:`, JSON.stringify(statusObj.errors[0], null, 2));
                        }
                        continue; // Status එකක් නම් ඊළඟට යන්න ඕනේ නෑ
                    }

                    // ... ඉතුරු ටික (value.messages අල්ලන එක) පරණ විදිහටමයි ...
                    if (value.messages && value.messages.length > 0) {
                        const msgObj = value.messages[0];
                        const msgId = msgObj.id; 
                        const from = msgObj.from; 

                        if (msgId && processedMessageIds.has(msgId)) {
                            console.log(`🛑 Blocked Meta Retry ID: ${msgId}`);
                            continue;
                        }
                        if (msgId) {
                            processedMessageIds.add(msgId);
                            setTimeout(() => processedMessageIds.delete(msgId), 10 * 60 * 1000);
                        }

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

                        const sanitizedBotNum = display_phone_number ? display_phone_number.replace(/\D/g, '') : '';
                        if (from === sanitizedBotNum || (sanitizedBotNum && from.includes(sanitizedBotNum))) {
                            continue;
                        }

                        if (msgType === 'system' || msgType === 'unknown' || msgType === 'unsupported') {
                            continue;
                        }

                        console.log(`\n=========================================`);
                        console.log(`📩 Incoming message from: ${from} | Target Phone ID: [${phone_number_id}] | Type: ${msgType}`);

                        // 1. Check Client
                        const { data: clients, error: clientErr } = await supabase.from('users').select('*').eq('phone_number_id', phone_number_id).limit(1);
                        if (clientErr) console.error(`❌ DB Error fetching client:`, clientErr);
                        
                        const client = clients && clients.length > 0 ? clients[0] : null;

                        if (!client) {
                            console.log(`❌ ERROR: No client found in DB for phone_number_id: [${phone_number_id}]. Ensure this ID is saved exactly in the Admin Settings without spaces!`);
                            console.log(`=========================================\n`);
                            continue;
                        }
                        
                        console.log(`✅ Client Matched: ${client.business_name} (ID: ${client.id})`);

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
                            const interactiveType = msgObj.interactive.type;
                            if (interactiveType === "button_reply") {
                                msgBody = msgObj.interactive.button_reply.title;
                            } else if (interactiveType === "list_reply") {
                                msgBody = msgObj.interactive.list_reply.title;
                            } else {
                                msgBody = "Interactive Reply";
                            }
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
                        
                        // Clean out PostgreSQL Null Bytes (\u0000)
                        msgBody = msgBody ? msgBody.replace(/\0/g, '') : "";
                        lastMessageText = lastMessageText ? lastMessageText.replace(/\0/g, '') : "";

                        // 2. Check/Create Contact
                        console.log(`👤 Checking contact...`);
                        let { data: contacts, error: contactErr } = await supabase.from('contacts').select('*').eq('phone_number', from).eq('owner_id', client.id).limit(1);
                        if (contactErr) console.error("❌ DB Error fetching contact:", contactErr);
                        
                        let contact = contacts && contacts.length > 0 ? contacts[0] : null;

                        if (!contact) {
                            const { data: newContacts, error: newContactErr } = await supabase.from('contacts').insert([{
                                phone_number: from, 
                                owner_id: client.id, 
                                name: `Guest ${from.slice(-4)}`, 
                                unread_count: 1,
                                followup_sent: false 
                            }]).select().limit(1);
                            if (newContactErr) console.error("❌ DB Error creating contact:", newContactErr);
                            contact = newContacts && newContacts.length > 0 ? newContacts[0] : null;
                        } else {
                            const { error: updateErr } = await supabase.from('contacts').update({
                                last_message: lastMessageText,
                                last_message_time: new Date().toISOString(),
                                unread_count: (contact.unread_count || 0) + 1,
                                followup_sent: false 
                            }).eq('id', contact.id);
                            if (updateErr) console.error("❌ DB Error updating contact:", updateErr);
                        }

                        if (!contact) {
                            console.log("❌ Failed to resolve contact object. Aborting.");
                            continue;
                        }

                        // 3. Save Message
                        console.log(`💾 Saving message: "${lastMessageText}"`);
                        const { error: msgSaveErr } = await supabase.from('messages').insert([{
                            contact_id: contact.id,
                            owner_id: client.id,
                            text: msgBody, 
                            sender: "customer",
                            type: msgType === 'button' || msgType === 'interactive' ? 'text' : msgType, 
                            media_url: finalMediaUrl,
                            whatsapp_message_id: msgId
                        }]);
                        if (msgSaveErr) console.error("❌ DB Error saving message:", msgSaveErr);
                        else console.log(`✅ Message saved to Inbox.`);

                        // 4. Bot Auto-Reply
                        console.log(`🤖 Checking Bot Config...`);
                        const { data: botConfigs, error: botErr } = await supabase.from('bot_configs').select('*').eq('owner_id', client.id).limit(1);
                        if (botErr) console.error("❌ DB Error fetching bot configs:", botErr);
                        
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

                                const { error: sessionUpdateErr } = await supabase.from('chat_sessions')
                                    .update({ current_step: currentStep + 1, last_active: new Date(now).toISOString() })
                                    .eq('id', session.id);
                                if (sessionUpdateErr) console.error("❌ DB Error updating session:", sessionUpdateErr);

                                console.log(`🚀 Sending Bot Reply (Step ${currentStep + 1})...`);
                                const botMsgId = await sendWhatsAppMessage(client, from, reply);

                                if (botMsgId) {
                                    await supabase.from('messages').insert([{
                                        contact_id: contact.id,
                                        owner_id: client.id,
                                        text: reply.text || "Bot Media",
                                        sender: "me",
                                        direction: "outbound",
                                        is_bot_reply: true,
                                        type: reply.mediaType || 'text',
                                        media_url: reply.media || null,
                                        whatsapp_message_id: botMsgId
                                    }]);
                                    console.log(`✅ Bot reply sent & saved.`);
                                } else {
                                    console.log(`❌ Failed to send Bot reply via Meta.`);
                                }
                            } else {
                                console.log(`✅ Flow completed. No more bot replies.`);
                            }
                        } else {
                            console.log(`🛑 Bot is OFF or has no replies set.`);
                        }
                        console.log(`=========================================\n`);
                    }
                }
            }
        }
    } catch (err) {
        console.error("❌ Webhook Critical Error: ", err);
    }
});

module.exports = router;