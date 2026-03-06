const router = require("express").Router();
const supabase = require("../supabase");
const { verifyToken } = require("../verifyToken");

// 1. CREATE NEW QUICK REPLY
router.post("/add", verifyToken, async (req, res) => {
  try {
    // 🔥 NEW: Getting mediaUrl and mediaType from frontend
    const { title, message, mediaUrl, mediaType } = req.body;
    
    let ownerId = req.user.id;
    if (req.user.role === 'agent') {
        const { data: agentData } = await supabase.from('users').select('owner_id').eq('id', req.user.id).single();
        if (agentData && agentData.owner_id) ownerId = agentData.owner_id;
    }

    const { data, error } = await supabase.from('quick_replies').insert([{
        user_id: String(ownerId), 
        title: title,
        message: message || "",
        media_url: mediaUrl || null,    // 🔥 NEW
        media_type: mediaType || 'text' // 🔥 NEW
    }]).select();

    if (error) throw error;
    res.status(200).json(data[0]);
  } catch (err) {
    console.error("Quick Reply Add Error:", err);
    res.status(500).json({ message: err.message });
  }
});

// 2. GET MY QUICK REPLIES
router.get("/my", verifyToken, async (req, res) => {
  try {
    let ownerId = req.user.id;
    if (req.user.role === 'agent') {
        const { data: agentData } = await supabase.from('users').select('owner_id').eq('id', req.user.id).single();
        if (agentData && agentData.owner_id) ownerId = agentData.owner_id;
    }

    const { data, error } = await supabase
        .from('quick_replies')
        .select('*')
        .eq('user_id', String(ownerId))
        .order('created_at', { ascending: false });

    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    console.error("Quick Reply Fetch Error:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;