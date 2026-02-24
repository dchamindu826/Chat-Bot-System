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

// 2. SEND MESSAGE
router.post("/send", verifyToken, async (req, res) => {
    try {
        const { contactId, to, text, type, mediaUrl } = req.body;
        
        let ownerId = req.user.id; // මුලින්ම ලොග් වූ කෙනාගේ (Agent හෝ Admin) ID එක ගන්නවා

        // 🔥 ලොග් වී සිටින්නේ Agent කෙනෙක් නම්, Database එකෙන් ඔහුගේ Owner ව සොයාගැනීම
        if (req.user.role && req.user.role.toLowerCase() === 'agent') {
            const { data: agentData, error: agentErr } = await supabase
                .from('users')
                .select('owner_id')
                .eq('id', req.user.id)
                .single();
                
            if (agentData && agentData.owner_id) {
                ownerId = agentData.owner_id; // Owner ගේ ID එකට මාරු කරනවා
            } else {
                console.log("❌ Agent lacks owner_id:", req.user.email);
                return res.status(400).json({ message: "Agent setup incomplete: owner_id not found." });
            }
        }

        // 🔥 දැන් Owner ගේ WhatsApp විස්තර ගන්නවා (Admin ගේ phone_number_id)
        const { data: ownerUser, error: ownerErr } = await supabase
            .from('users')
            .select('*')
            .eq('id', ownerId)
            .single();
        
        if (ownerErr || !ownerUser) return res.status(404).json({ message: "Owner config not found" });

        if (!ownerUser.phone_number_id) {
            console.error(`❌ Missing phone_number_id for Owner: ${ownerUser.email}`);
            return res.status(400).json({ message: "WhatsApp API is not configured. Missing Phone Number ID." });
        }

        // Meta API වෙත යැවීම
        const url = `https://graph.facebook.com/v17.0/${ownerUser.phone_number_id}/messages`;
        const headers = { Authorization: `Bearer ${ownerUser.access_token}`, "Content-Type": "application/json" };
        
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

        // Database එකේ Save කිරීම
        const { data: savedMsg, error: saveErr } = await supabase.from('messages').insert([{
            contact_id: contactId,
            owner_id: ownerId, // මැසේජ් එක අයිති Owner ට
            text: text || "",
            sender: "me",
            direction: "outbound",
            type: type || "text",
            media_url: mediaUrl || null
        }]).select().single();

        if (saveErr) throw saveErr;

        // Contact Update
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