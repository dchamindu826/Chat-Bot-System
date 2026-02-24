const router = require("express").Router();
const supabase = require("../supabase"); // Supabase client එක import කරන්න
const { verifyToken } = require("../verifyToken");

// 1. CREATE NEW QUICK REPLY (Supabase)
router.post("/add", verifyToken, async (req, res) => {
  try {
    const { title, message } = req.body;
    
    // Supabase වලට Insert කිරීම
    const { data, error } = await supabase.from('quick_replies').insert([{
        user_id: req.user.id, // Log වෙලා ඉන්න User ගේ ID එක
        title: title,
        message: message
    }]).select();

    if (error) throw error;
    res.status(200).json(data[0]);
  } catch (err) {
    console.error("Quick Reply Add Error:", err);
    res.status(500).json({ message: err.message });
  }
});

// 2. GET MY QUICK REPLIES (Supabase)
router.get("/my", verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
        .from('quick_replies')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });

    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    console.error("Quick Reply Fetch Error:", err);
    res.status(500).json({ message: err.message });
  }
});

// 3. DELETE QUICK REPLY (Supabase)
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const { error } = await supabase
        .from('quick_replies')
        .delete()
        .eq('id', req.params.id)
        .eq('user_id', req.user.id); // ආරක්ෂාවට user_id එකත් check කරනවා

    if (error) throw error;
    res.status(200).json("Quick Reply has been deleted...");
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;