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
        
        // Frontend එකට ගැලපෙන ලෙස map කිරීම
        const formattedMessages = data.map(m => ({
            ...m,
            _id: m.id,
            mediaUrl: m.media_url,
            createdAt: m.created_at
        }));

        res.status(200).json(formattedMessages);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 2. SEND MESSAGE
router.post("/send", verifyToken, async (req, res) => {
    try {
        const { contactId, to, text, type, mediaUrl } = req.body;
        
        // Agent නම් Owner ගේ ID එක ගන්න, නැත්නම් තමන්ගේම ID එක
        const ownerId = req.user.role === 'agent' && req.user.owner_id ? req.user.owner_id : req.user.id;

        // Owner ගේ විස්තර ගන්න (Phone ID, Access Token)
        const { data: user, error: userErr } = await supabase.from('users').select('*').eq('id', ownerId).single();
        
        if (userErr || !user) return res.status(404).json({ message: "Owner config not found" });

        if (!user.phone_number_id) {
            return res.status(400).json({ message: "WhatsApp API not configured. Missing Phone Number ID." });
        }

        const url = `https://graph.facebook.com/v17.0/${user.phone_number_id}/messages`;
        const headers = { Authorization: `Bearer ${user.access_token}`, "Content-Type": "application/json" };
        
        let payload = { messaging_product: "whatsapp", recipient_type: "individual", to: to };

        // Attachments/Voice Handling
        if (type && type !== 'text' && mediaUrl) {
            payload.type = type;
            payload[type] = { link: mediaUrl };
            // Audio වලට caption දාන්න බෑ, අනිත් ඒවාට පුළුවන්
            if(text && type !== 'audio') payload[type].caption = text;
        } else {
            payload.type = "text";
            payload.text = { body: text };
        }

        // Meta API වෙත යැවීම
        await axios.post(url, payload, { headers });

        // Database එකේ Save කිරීම
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

        // Contact Update (Last message)
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
        res.status(500).json({ message: "Failed to send message via WhatsApp API" });
    }
});

module.exports = router;