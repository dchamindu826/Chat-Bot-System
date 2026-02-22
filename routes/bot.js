const router = require("express").Router();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 1. Get Bot Config (Bot Builder එක ලෝඩ් වෙද්දී)
router.get("/:userId", async (req, res) => {
    const { data, error } = await supabase.from("bot_configs").select("*").eq("owner_id", req.params.userId).single();
    if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
    
    res.status(200).json({
        replies: data ? data.replies : [],
        isActive: data ? data.is_active : true
    });
});

// 2. Save Bot Config (Save Flow බටන් එක)
router.post("/save", async (req, res) => {
    const { ownerId, replies, isActive } = req.body;
    
    // Supabase එකට Upsert කරනවා (තිබ්බොත් අප්ඩේට්, නැත්නම් අලුතින් දානවා)
    const { data, error } = await supabase.from("bot_configs").upsert([{
        owner_id: ownerId,
        replies: replies,
        is_active: isActive
    }], { onConflict: 'owner_id' }).select();

    if (error) return res.status(500).json({ message: error.message });
    res.status(200).json(data[0]);
});

module.exports = router;