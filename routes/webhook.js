const router = require("express").Router();
const axios = require("axios");
const supabase = require("../supabase");
const FormData = require("form-data");

const SESSION_TIMEOUT = 3 * 24 * 60 * 60 * 1000;
const CLOUD_NAME = "dyixoaldi";
const UPLOAD_PRESET = "Chat Bot System";

// Webhook Verification
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

// Meta එකෙන් Media URL එක ගන්න Function එක
const getMediaUrlFromMeta = async (mediaId, accessToken) => {
    try {
        const response = await axios.get(`https://graph.facebook.com/v17.0/${mediaId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        return response.data.url;
    } catch (err) {
        console.error("❌ Fetch Media URL Error:", err.message);
        return null;
    }
};

// Meta එකෙන් Media Download කරලා Cloudinary එකට Upload කරන Function එක
const uploadMediaToCloudinary = async (mediaUrl, accessToken) => {
    try {
        // Meta එකෙන් File එක ගන්නවා
        const response = await axios.get(mediaUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
            responseType: 'arraybuffer' // Binary විදිහට ගන්නවා
        });

        // Cloudinary එකට යවන්න Form Data හදනවා
        const formData = new FormData();
        const buffer = Buffer.from(response.data, 'binary');
        
        // Mime Type එකෙන් extension එක අනුමාන කිරීම (Cloudinary ඔටෝ manage කරනවා ගොඩක් වෙලාවට)
        formData.append("file", buffer, { filename: "downloaded_media" });
        formData.append("upload_preset", UPLOAD_PRESET);

        // Cloudinary එකට Upload කරනවා
        const cloudRes = await axios.post(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, formData, {
            headers: {
                ...formData.getHeaders()
            }
        });

        return cloudRes.data.secure_url;

    } catch (error) {
        console.error("❌ Cloudinary Upload Error:", error.message);
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

                    if (value.statuses) {
                        const status = value.statuses[0];
                        if (status.status === 'failed' && status.errors) {
                            console.error("❌ WhatsApp Voice/Media Delivery Failed:", JSON.stringify(status.errors, null, 2));
                        }
                        continue;
                    }

                    if (value.messages && value.messages.length > 0) {
                        const msgObj = value.messages[0];
                        const from = msgObj.from;
                        const msgType = msgObj.type;
                        const phone_number_id = value.metadata.phone_number_id;
                        const display_phone_number = value.metadata.display_phone_number;

                        const sanitizedBotNum = display_phone_number ? display_phone_number.replace(/\D/g, '') : '';
                        if (from === sanitizedBotNum) {
                            continue;
                        }

                        console.log(`📩 Incoming message from: ${from}`);

                        const { data: clients, error: clientErr } = await supabase.from('users').select('*').eq('phone_number_id', phone_number_id).limit(1);
                        const client = clients && clients.length > 0 ? clients[0] : null;

                        if (!client) {
                            console.log("❌ Webhook: Client not found for phone_number_id:", phone_number_id);
                            continue;
                        }

                        let msgBody = "";
                        let finalMediaUrl = null;

                        // 🔴 Customer එවන Media එක අල්ලගන්න තැන 🔴
                        if (msgType === "text") {
                            msgBody = msgObj.text.body;
                        } else if (["image", "video", "audio", "document", "sticker"].includes(msgType)) {
                            // Media object එක ගන්නවා (msgObj.image, msgObj.video වගේ)
                            const mediaObj = msgObj[msgType];
                            const mediaId = mediaObj.id;
                            
                            // Caption එකක් තියෙනවා නම් ගන්නවා
                            msgBody = mediaObj.caption || `📷 ${msgType} Received`;

                            console.log(`⏳ Downloading customer ${msgType}...`);
                            
                            // Meta එකෙන් URL එක ගන්නවා
                            const metaMediaUrl = await getMediaUrlFromMeta(mediaId, client.access_token);
                            
                            if (metaMediaUrl) {
                                // Cloudinary එකට Upload කරලා ස්ථිර URL එක ගන්නවා
                                finalMediaUrl = await uploadMediaToCloudinary(metaMediaUrl, client.access_token);
                                console.log(`✅ Uploaded to Cloudinary: ${finalMediaUrl}`);
                            }
                        } else {
                            msgBody = `📷 ${msgType} Received`;
                        }

                        let { data: contacts } = await supabase.from('contacts').select('*').eq('phone_number', from).eq('owner_id', client.id).limit(1);
                        let contact = contacts && contacts.length > 0 ? contacts[0] : null;

                        if (!contact) {
                            const { data: newContacts } = await supabase.from('contacts').insert([{
                                phone_number: from, owner_id: client.id, name: `Guest ${from.slice(-4)}`, unread_count: 1
                            }]).select().limit(1);
                            contact = newContacts && newContacts.length > 0 ? newContacts[0] : null;
                        } else {
                            await supabase.from('contacts').update({
                                last_message: msgBody,
                                last_message_time: new Date().toISOString(),
                                unread_count: (contact.unread_count || 0) + 1
                            }).eq('id', contact.id);
                        }

                        if (!contact) continue;

                        // 🔴 Database එකට Media URL එක Save කරන තැන 🔴
                        await supabase.from('messages').insert([{
                            contact_id: contact.id,
                            owner_id: client.id,
                            text: msgBody,
                            sender: "customer",
                            type: msgType,
                            media_url: finalMediaUrl // මෙතනට අලුත් URL එක එනවා
                        }]);

                        // Bot Logic...
                        const { data: botConfigs } = await supabase.from('bot_configs').select('*').eq('owner_id', client.id).limit(1);
                        const botConfig = botConfigs && botConfigs.length > 0 ? botConfigs[0] : null;

                        if (botConfig && botConfig.is_active && botConfig.replies && botConfig.replies.length > 0) {
                            let { data: sessions } = await supabase.from('chat_sessions').select('*').eq('user_id', client.id).eq('phone_number', from).limit(1);
                            let session = sessions && sessions.length > 0 ? sessions[0] : null;

                            if (!session) {
                                const { data: newSessions } = await supabase.from('chat_sessions').insert([{ user_id: client.id, phone_number: from, current_step: 0 }]).select().limit(1);
                                session = newSessions && newSessions.length > 0 ? newSessions[0] : null;
                            }

                            if ((Date.now() - new Date(session.last_active).getTime()) > SESSION_TIMEOUT) session.current_step = 0;
                            if (msgType === 'text' && (msgBody.toLowerCase() === 'hi' || msgBody.toLowerCase() === 'start')) session.current_step = 0;

                            if (session.current_step < botConfig.replies.length) {
                                const reply = botConfig.replies[session.current_step];

                                await sendWhatsAppMessage(client, from, reply);

                                await supabase.from('messages').insert([{
                                    contact_id: contact.id,
                                    owner_id: client.id,
                                    text: reply.text || "Bot Media",
                                    sender: "me",
                                    direction: "outbound",
                                    is_bot_reply: true,
                                    type: reply.mediaType || 'text',
                                    media_url: reply.media || null
                                }]);

                                await supabase.from('chat_sessions').update({ current_step: session.current_step + 1, last_active: new Date().toISOString() }).eq('id', session.id);
                            }
                        }
                    }
                }
            }
        }
    } catch (err) { console.error("❌ Webhook Fatal Error:", err.message); }
});

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

        await axios.post(url, body, { headers });
    } catch (error) {
        console.error("❌ Bot Send Failed:", error.response ? error.response.data : error.message);
    }
};

module.exports = router;