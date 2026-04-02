const router = require("express").Router();
const supabase = require("../supabase");
const { verifyToken } = require("../verifyToken");

// Helper function to get correct Owner ID
const getOwnerId = async (user) => {
    if (user.role === 'agent') {
        const { data } = await supabase.from('users').select('owner_id').eq('id', user.id).single();
        return data?.owner_id || user.id;
    }
    return user.id;
};

// 1. CREATE NEW QUICK REPLY
router.post("/add", verifyToken, async (req, res) => {
  try {
    const { title, message, mediaUrl, mediaType } = req.body;
    const ownerId = await getOwnerId(req.user);

    const { data, error } = await supabase.from('quick_replies').insert([{
        user_id: String(ownerId), // 🔥 මෙය Database එකේ column එකට සමාන විය යුතුයි
        title: title,
        message: message || "",
        media_url: mediaUrl || null,
        media_type: mediaType || 'text'
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
    const ownerId = await getOwnerId(req.user);

    const { data, error } = await supabase
        .from('quick_replies')
        .select('*')
        .eq('user_id', String(ownerId)) // 🔥 අදාල Business එකේ Data විතරයි එන්නේ
        .order('created_at', { ascending: false });

    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    console.error("Quick Reply Fetch Error:", err);
    res.status(500).json({ message: err.message });
  }
});

// 3. DELETE QUICK REPLY
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const { error } = await supabase
        .from('quick_replies')
        .delete()
        .eq('id', req.params.id);

    if (error) throw error;
    res.status(200).json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("Quick Reply Delete Error:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;