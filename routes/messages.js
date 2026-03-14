const router = require("express").Router();
const axios = require("axios");
const supabase = require("../supabase");
const { verifyToken } = require("../verifyToken");

// 1. GET MESSAGES
router.get("/:contactId", verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('contact_id', req.params.contactId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        await supabase.from('contacts').update({ unread_count: 0 }).eq('id', req.params.contactId);

        const formattedMessages = data.map(m => ({
            ...m,
            _id: m.id,
            mediaUrl: m.media_url,
            createdAt: m.created_at,
            whatsapp_message_id: m.whatsapp_message_id,
            replyContext: m.reply_context,
            agentName: m.agent_name // 🔥 NEW: Database එකෙන් Agent ගේ නම ගන්නවා
        }));

        res.status(200).json(formattedMessages);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 2. SEND MESSAGE
router.post("/send", verifyToken, async (req, res) => {
    try {
        // 🔥 NEW: Frontend එකෙන් එවන agentName එක ගන්නවා
        const { contactId, to, text, type, mediaUrl, replyToMessageId, replyContext, agentName } = req.body;
        
        let ownerId = req.user.id; 

        if (req.user.role && req.user.role.toLowerCase() === 'agent') {
            const { data: agentData } = await supabase.from('users').select('owner_id').eq('id', req.user.id).single();
            if (agentData && agentData.owner_id) ownerId = agentData.owner_id; 
            else return res.status(400).json({ message: "Agent setup incomplete." });
        }

        const { data: ownerUser } = await supabase.from('users').select('*').eq('id', ownerId).single();
        if (!ownerUser || !ownerUser.phone_number_id) return res.status(400).json({ message: "WhatsApp API is not configured." });

        const url = `https://graph.facebook.com/v17.0/${ownerUser.phone_number_id}/messages`;
        const headers = { Authorization: `Bearer ${ownerUser.access_token}`, "Content-Type": "application/json" };
        
        let payload = { messaging_product: "whatsapp", recipient_type: "individual", to: to };

        if (replyToMessageId) {
            payload.context = { message_id: replyToMessageId };
        }

        if (type && type !== 'text' && mediaUrl) {
            payload.type = type;
            payload[type] = { link: mediaUrl };
            if(text && type !== 'audio') payload[type].caption = text;
        } else {
            payload.type = "text";
            payload.text = { body: text };
        }

        const response = await axios.post(url, payload, { headers });
        const waMessageId = response.data.messages?.[0]?.id || null;

        // 🔥 Database එකට Insert කරනවා
        const { data: savedMsg, error: saveErr } = await supabase.from('messages').insert([{
            contact_id: contactId,
            owner_id: ownerId, 
            text: text || "",
            sender: "me",
            direction: "outbound",
            type: type || "text",
            media_url: mediaUrl || null,
            whatsapp_message_id: waMessageId,
            reply_context: replyContext || null,
            agent_name: agentName || null // 🔥 NEW: Agent Name එක Database එකට යවනවා
        }]).select().single();

        if (saveErr) {
            console.error("Database Insert Error:", saveErr); // Error එක terminal එකේ බලාගන්න
            throw saveErr;
        }

        await supabase.from('contacts').update({
            last_message: text || `Sent a ${type}`,
            last_message_time: new Date().toISOString()
        }).eq('id', contactId);

        res.status(200).json({
            ...savedMsg,
            _id: savedMsg.id,
            mediaUrl: savedMsg.media_url,
            createdAt: savedMsg.created_at,
            replyContext: savedMsg.reply_context,
            agentName: savedMsg.agent_name // 🔥 NEW
        });

    } catch (err) {
        console.error("Send Message Error:", err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;