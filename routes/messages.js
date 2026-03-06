const router = require("express").Router();
const axios = require("axios");
const supabase = require("../supabase");
const { verifyToken } = require("../verifyToken");

// 1. GET MESSAGES FOR A CONTACT
router.get("/:contactId", verifyToken, async (req, res) => {
    try {
        // අදාල Chat එකේ මැසේජ් ටික ගන්නවා
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('contact_id', req.params.contactId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // 🔥 FIX: Chat එක open කරපු ගමන් (මැසේජ් ටික ඉල්ලපු ගමන්), Database එකේ Unread Count එක 0 කරනවා
        await supabase
            .from('contacts')
            .update({ unread_count: 0 })
            .eq('id', req.params.contactId);

        const formattedMessages = data.map(m => ({
            ...m,
            _id: m.id,
            mediaUrl: m.media_url,
            createdAt: m.created_at,
            whatsapp_message_id: m.whatsapp_message_id // 🔥 NEW: Reply කරන්න WhatsApp Message ID එක Frontend එකට යවනවා
        }));

        res.status(200).json(formattedMessages);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 2. SEND MESSAGE
router.post("/send", verifyToken, async (req, res) => {
    try {
        // 🔥 NEW: replyToMessageId එක req.body එකෙන් ගන්නවා
        const { contactId, to, text, type, mediaUrl, replyToMessageId } = req.body;
        
        let ownerId = req.user.id; 

        if (req.user.role && req.user.role.toLowerCase() === 'agent') {
            const { data: agentData, error: agentErr } = await supabase
                .from('users')
                .select('owner_id')
                .eq('id', req.user.id)
                .single();
                
            if (agentData && agentData.owner_id) {
                ownerId = agentData.owner_id; 
            } else {
                return res.status(400).json({ message: "Agent setup incomplete: owner_id not found." });
            }
        }

        const { data: ownerUser, error: ownerErr } = await supabase
            .from('users')
            .select('*')
            .eq('id', ownerId)
            .single();
        
        if (ownerErr || !ownerUser) return res.status(404).json({ message: "Owner config not found" });

        if (!ownerUser.phone_number_id) {
            return res.status(400).json({ message: "WhatsApp API is not configured. Missing Phone Number ID." });
        }

        const url = `https://graph.facebook.com/v17.0/${ownerUser.phone_number_id}/messages`;
        const headers = { Authorization: `Bearer ${ownerUser.access_token}`, "Content-Type": "application/json" };
        
        let payload = { messaging_product: "whatsapp", recipient_type: "individual", to: to };

        // 🔥 NEW: Reply කරනවා නම්, ඒ අදාල Message ID එක Payload එකට දානවා (Context Reply)
        if (replyToMessageId) {
            payload.context = {
                message_id: replyToMessageId
            };
        }

        if (type && type !== 'text' && mediaUrl) {
            payload.type = type;
            payload[type] = { link: mediaUrl };
            if(text && type !== 'audio') payload[type].caption = text;
        } else {
            payload.type = "text";
            payload.text = { body: text };
        }

        await axios.post(url, payload, { headers });

        const { data: savedMsg, error: saveErr } = await supabase.from('messages').insert([{
            contact_id: contactId,
            owner_id: ownerId, 
            text: text || "",
            sender: "me",
            direction: "outbound",
            type: type || "text",
            media_url: mediaUrl || null
        }]).select().single();

        if (saveErr) throw saveErr;

        await supabase.from('contacts').update({
            last_message: text || `Sent a ${type}`,
            last_message_time: new Date().toISOString()
        }).eq('id', contactId);

        res.status(200).json({
            ...savedMsg,
            _id: savedMsg.id,
            mediaUrl: savedMsg.media_url,
            createdAt: savedMsg.created_at
        });

    } catch (err) {
        console.error("Send Error:", err.response ? err.response.data : err.message);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;