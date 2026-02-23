const router = require("express").Router();
const axios = require("axios");
const supabase = require("../supabase");
const { verifyToken } = require("../verifyToken");

// 1. GET MESSAGES FOR A CONTACT
router.get("/:contactId", verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('contact_id', req.params.contactId)
            .order('created_at', { ascending: true });

        if (error) throw error;

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

// 2. SEND MESSAGE (From Admin/Agent Dashboard to Meta API)
router.post("/send", verifyToken, async (req, res) => {
    try {
        const { contactId, to, text, type, mediaUrl } = req.body;
        const ownerId = req.user.role === 'agent' ? req.user.owner_id || req.user.id : req.user.id;

        // 1. Client ගේ API Details ගන්නවා
        // (මෙතනදී Admin ගේ ID එකෙන් තමයි Meta Phone Number ID එක ගන්නේ)
        const { data: user, error: userErr } = await supabase.from('users').select('*').eq('id', ownerId).single();
        if (userErr || !user) return res.status(404).json({ message: "User config not found" });

        // 2. Meta API එකට යවනවා
        const url = `https://graph.facebook.com/v17.0/${user.phone_number_id}/messages`;
        const headers = { Authorization: `Bearer ${user.access_token}`, "Content-Type": "application/json" };
        
        let payload = { messaging_product: "whatsapp", recipient_type: "individual", to: to };

        if (type && type !== 'text' && mediaUrl) {
            payload.type = type;
            payload[type] = { link: mediaUrl };
            if(text && type !== 'audio') payload[type].caption = text;
        } else {
            payload.type = "text";
            payload.text = { body: text };
        }

        await axios.post(url, payload, { headers });

        // 3. Database එකේ Save කරනවා
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

        // 4. Contact ගේ අන්තිම මැසේජ් එක Update කරනවා
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
        console.error("Message Send Error:", err.response ? err.response.data : err.message);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;