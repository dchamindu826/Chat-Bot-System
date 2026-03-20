const router = require("express").Router();
const axios = require("axios");
const supabase = require("../supabase"); // 🔥 Supabase Import කරා
const Broadcast = require("../models/Broadcast");
const User = require("../models/User");

// 🔥 SECURITY KEY
const CRON_SECRET = "my_secure_cron_key_123"; 

// Helper function to detect media type from URL
const getHeaderType = (url) => {
    if (!url) return null;
    const ext = url.split('.').pop().toLowerCase();
    if (['mp4', '3gp', 'mov'].includes(ext)) return 'video';
    if (['pdf', 'doc', 'docx'].includes(ext)) return 'document';
    return 'image';
};

// ==========================================
// 1. පරණ Broadcast Cron එක (වෙනසක් නෑ)
// ==========================================
router.get("/run", async (req, res) => {
    // ... (ඔයාගේ පරණ Broadcast කෝඩ් එක ඒ විදිහටම තියන්න) ...
    if (req.query.key !== CRON_SECRET) {
        return res.status(403).json({ message: "Unauthorized Cron Access" });
    }
    // (මෙතන ඉතුරු ටික එහෙම්මම තියන්න)
});

// ==========================================
// 2. අලුත් 23-Hour Follow-Up Cron එක 🔥
// ==========================================
router.get("/run-followups", async (req, res) => {
    // 1. Security Check
    if (req.query.key !== CRON_SECRET) {
        return res.status(403).json({ message: "Unauthorized Cron Access" });
    }

    console.log("⏰ Cron Triggered: Checking for 23-Hour Follow-ups...");

    try {
        const now = new Date();
        // පැය 20 ටත් 24 ටත් අතර කාලය හොයනවා
        const twentyFourHoursAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString(); // විනාඩි 5යි
        const twentyHoursAgo = new Date(now.getTime() - 1 * 60 * 1000).toISOString(); // විනාඩි 1යි

        // 2. පැය 20 පැන්න, ඒත් 24 පැනපු නැති, තාම follow up යවපු නැති Contacts හොයනවා
        const { data: contacts, error } = await supabase
            .from('contacts')
            .select('id, phone_number, owner_id, last_message_time')
            .eq('followup_sent', false)
            .lte('last_message_time', twentyHoursAgo) // 👈 මෙතනත් twentyHoursAgo කියලා නම වෙනස් කරා
            .gte('last_message_time', twentyFourHoursAgo);

        if (error) throw error;

        if (!contacts || contacts.length === 0) {
            return res.status(200).json({ message: "No follow-ups needed right now." });
        }

        console.log(`🚀 Found ${contacts.length} contacts for follow-up.`);

        let successCount = 0;

        // 3. Contacts ලූප් කරලා මැසේජ් යවනවා
        for (const contact of contacts) {
            
            // 🔥🔥🔥 THE SAFETY LOCK (ගොඩක්ම වැදගත්) 🔥🔥🔥
            // යවන්නත් කලින්ම Database එකේ true කියලා අප්ඩේට් කරනවා! 
            // එතකොට මොකක් හරි වෙලා fail වුණත් ඊළඟ පාර ආයේ යවලා සල්ලි කපෙන්නේ නෑ!
            await supabase.from('contacts').update({ followup_sent: true }).eq('id', contact.id);

            // Owner ගේ WhatsApp Access Token එක ගන්නවා
            const { data: clientData } = await supabase
                .from('users')
                .select('phone_number_id, access_token')
                .eq('id', contact.owner_id)
                .single();

            if (!clientData || !clientData.phone_number_id) continue;

            // Meta WhatsApp API එකට යවන Button Message එක
            const url = `https://graph.facebook.com/v18.0/${clientData.phone_number_id}/messages`;
            const body = {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: contact.phone_number,
                type: "interactive",
                interactive: {
                    type: "button",
                    body: {
                        // 👇 \n දාලා තියෙන්නේ ඊළඟ පේළියට කඩන්න
                        text: "ආයුබෝවන් පුතේ,\nඔයාගේ ගැටලුවට විසඳුමක් ලැබුණද ?" 
                    },
                    action: {
                        buttons: [
                            { type: "reply", reply: { id: "ans_yes", title: "ඔව්" } },
                            { type: "reply", reply: { id: "ans_no", title: "නෑ" } }
                        ]
                    }
                }
            
            };

            try {
                await axios.post(url, body, {
                    headers: { Authorization: `Bearer ${clientData.access_token}`, "Content-Type": "application/json" }
                });
                successCount++;
                console.log(`✅ Follow-up sent to ${contact.phone_number}`);
            } catch (err) {
                console.error(`❌ Follow-up failed for ${contact.phone_number}:`, err.response ? err.response.data : err.message);
            }

            try {
                // 1. Meta එකට මැසේජ් එක යවනවා (දැනට තියෙන කෑල්ල)
                const response = await axios.post(url, body, {
                    headers: { Authorization: `Bearer ${clientData.access_token}`, "Content-Type": "application/json" }
                });

                // Meta එකෙන් එන Message ID එක ගන්නවා (Delivery Status එක හරියටම අල්ලගන්න)
                const metaMsgId = response.data.messages?.[0]?.id || null;

                successCount++;
                console.log(`✅ Follow-up sent to ${contact.phone_number}`);

                // 🔥 2. අපේ Database එකේ Inbox එකට (messages table එකට) සේව් කරනවා
                const { error: msgSaveErr } = await supabase.from('messages').insert([{
                    contact_id: contact.id,
                    owner_id: contact.owner_id,
                    text: "ආයුබෝවන් පුතේ,\nඔයාගේ ගැටලුවට විසඳුමක් ලැබුණද ?\n\n[🔘 ඔව්] [🔘 නෑ]", // Inbox එකේ පේන විදිහ
                    sender: "me",
                    direction: "outbound",
                    type: "text", // Button Message එකක් වුණත් අපි text විදිහටම සේව් කරමු ලේසි වෙන්න
                    whatsapp_message_id: metaMsgId,
                    agent_name: "System (Auto Follow-up)" // කවුද යැව්වේ කියලා පැහැදිලි වෙන්න
                }]);

                if (msgSaveErr) {
                    console.error(`❌ DB Error saving follow-up message for ${contact.phone_number}:`, msgSaveErr);
                }

                // අන්තිම මැසේජ් එක විදිහට Contacts ටේබල් එකෙත් Update කරනවා (එතකොට Chat List එකෙත් උඩින්ම පෙනෙයි)
                await supabase.from('contacts').update({
                    last_message: "Auto Follow-up Sent",
                    last_message_time: new Date().toISOString()
                }).eq('id', contact.id);

            } catch (err) {
                console.error(`❌ Follow-up failed for ${contact.phone_number}:`, err.response ? err.response.data : err.message);
            }
        }

        res.status(200).json({ message: `Follow-up process completed. Sent: ${successCount}` });

    } catch (err) {
        console.error("Follow-up Cron Error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;