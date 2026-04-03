const router = require("express").Router();
const axios = require("axios");
const supabase = require("../supabase");
const { verifyToken } = require("../verifyToken");

// 100% Safe 24-Hour Broadcast
router.post("/send-24h", verifyToken, async (req, res) => {
    try {
        const { messageText, mediaUrl, mediaType } = req.body;
        
        if (!messageText && !mediaUrl) {
            return res.status(400).json({ message: "Message text or media is required." });
        }

        // Get Owner ID
        let ownerId = req.user.id;
        if (req.user.role === 'agent') {
            const { data: agentData } = await supabase.from('users').select('owner_id').eq('id', req.user.id).single();
            if (agentData && agentData.owner_id) ownerId = agentData.owner_id;
        }

        const { data: ownerUser } = await supabase.from('users').select('phone_number_id, access_token').eq('id', ownerId).single();
        if (!ownerUser || !ownerUser.phone_number_id) {
            return res.status(400).json({ message: "WhatsApp API is not configured." });
        }

        // 🔥 1. පැය 24 ඇතුළත Active Contacts ලා විතරක් Filter කිරීම
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        const { data: activeContacts, error: contactErr } = await supabase
            .from('contacts')
            .select('*')
            .eq('owner_id', ownerId)
            .gte('last_message_time', twentyFourHoursAgo); // පැය 24ට වඩා අලුත් ඒවා විතරයි

        if (contactErr) throw contactErr;

        if (!activeContacts || activeContacts.length === 0) {
            return res.status(400).json({ message: "No active contacts found in the last 24 hours." });
        }

        // ක්ෂණිකව Frontend එකට Success Response එක යවනවා (පරක්කු වෙන්නේ නැති වෙන්න)
        res.status(200).json({ 
            message: `Broadcast started successfully! Sending to ${activeContacts.length} active contacts in the background.` 
        });

        console.log(`🚀 SAFE BROADCAST STARTED: Sending to ${activeContacts.length} contacts...`);

        // 🔥 2. Background එකේ Loop එකක් නැතිවෙන්න හෙමීට යැවීම (Safe Loop)
        let successCount = 0;
        
        for (const contact of activeContacts) {
            try {
                let payload = {
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to: contact.phone_number,
                };

                if (mediaUrl) {
                    payload.type = mediaType || "image";
                    payload[payload.type] = { link: mediaUrl };
                    if (messageText) payload[payload.type].caption = messageText;
                } else {
                    payload.type = "text";
                    payload.text = { body: messageText };
                }

                // Meta එකට මැසේජ් එක යැවීම
                const waRes = await axios.post(`https://graph.facebook.com/v17.0/${ownerUser.phone_number_id}/messages`, payload, {
                    headers: { Authorization: `Bearer ${ownerUser.access_token}` }
                });

                // අපේ Database එකේ Save කිරීම
                await supabase.from('messages').insert([{
                    contact_id: contact.id,
                    owner_id: ownerId,
                    text: messageText || "[Broadcast Media]",
                    sender: "me",
                    direction: "outbound",
                    type: mediaUrl ? (mediaType || "image") : "text",
                    media_url: mediaUrl || null,
                    whatsapp_message_id: waRes.data.messages?.[0]?.id
                }]);

                successCount++;

                // 🛑 ANTI-LOOP & RATE LIMITER: එක මැසේජ් එකකට පස්සේ තත්පර 1ක පරතරයක් තියනවා (Meta එකෙන් Block වෙන එක නවත්තන්න)
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (err) {
                console.error(`❌ Failed to send broadcast to ${contact.phone_number}:`, err.response?.data || err.message);
            }
        }

        console.log(`✅ SAFE BROADCAST FINISHED: Successfully sent to ${successCount} out of ${activeContacts.length} contacts.`);

    } catch (err) {
        console.error("❌ Broadcast Critical Error:", err);
        if (!res.headersSent) {
            res.status(500).json({ message: "Server error occurred during broadcast." });
        }
    }
});

module.exports = router;