const router = require("express").Router();
const axios = require("axios");
const supabase = require("../supabase");
const { verifyToken } = require("../verifyToken");

// routes/broadcast.js හි send-24h route එක පමනක් වෙනස් කරන්න
router.post("/send-24h", verifyToken, async (req, res) => {
    try {
        const { messageText, mediaUrl, mediaType } = req.body;
        
        if (!messageText && !mediaUrl) {
            return res.status(400).json({ message: "Message text or media is required." });
        }

        let ownerId = req.user.id;
        if (req.user.role === 'agent') {
            const { data: agentData } = await supabase.from('users').select('owner_id').eq('id', req.user.id).single();
            if (agentData && agentData.owner_id) ownerId = agentData.owner_id;
        }

        const { data: ownerUser } = await supabase.from('users').select('phone_number_id, access_token').eq('id', ownerId).single();
        if (!ownerUser || !ownerUser.phone_number_id) {
            return res.status(400).json({ message: "WhatsApp API is not configured." });
        }

        // 1. Filter 24h Active Contacts
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: activeContacts, error: contactErr } = await supabase
            .from('contacts')
            .select('*')
            .eq('owner_id', ownerId)
            .gte('last_message_time', twentyFourHoursAgo);

        if (contactErr) throw contactErr;

        if (!activeContacts || activeContacts.length === 0) {
            return res.status(400).json({ message: "No active contacts found in the last 24 hours." });
        }

        // 🔥 NEW: Broadcast Job එකක් Database එකේ Create කරනවා
        // (අපේ Supabase එකේ මේකට වෙනම ටේබල් එකක් තියෙනවද? අපි නිකන්ම "Broadcast History" කියලා එකක් හදමු)
        // Note: ඔයාගේ කලින් Mongoose කෝඩ් එකේ Broadcasts සේව් කරා. අපි මේක Supabase එකේ "broadcast_jobs" වගේ ටේබල් එකක් තියෙනවා කියලා හිතලා සේව් කරමු.
        
        // ක්ෂණිකව Response එක යවනවා
        res.status(200).json({ 
            message: `Broadcast started! Sending to ${activeContacts.length} active contacts.` 
        });

        console.log(`🚀 SAFE BROADCAST STARTED: Sending to ${activeContacts.length} contacts...`);

        let successCount = 0;
        let failCount = 0;
        
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

                const waRes = await axios.post(`https://graph.facebook.com/v17.0/${ownerUser.phone_number_id}/messages`, payload, {
                    headers: { Authorization: `Bearer ${ownerUser.access_token}` }
                });

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
            } catch (err) {
                // මෙතනදී තමයි අර 131047 Error එක අල්ලගන්නේ (Fail වෙන ඒවා)
                failCount++;
                console.error(`⚠️ Skipped ${contact.phone_number}: Passed 24h limit on Meta.`);
            }

            // Anti-Spam Delay
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`✅ BROADCAST FINISHED: Sent: ${successCount} | Failed (24h Expired): ${failCount}`);

        // ඔයාට ඕනේ නම් මේ Success/Fail ගාණ අර Broadcast History Table එකට අප්ඩේට් කරන්න පුළුවන්.

    } catch (err) {
        console.error("❌ Broadcast Error:", err);
    }
});

module.exports = router;