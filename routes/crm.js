const router = require("express").Router();
const supabase = require("../supabase");
const { verifyToken } = require("../verifyToken");

router.get("/contacts", verifyToken, async (req, res) => {
  try {
    const { data: currentUser } = await supabase.from('users').select('*').eq('id', req.user.id).single();
    
    let query = supabase.from('contacts').select(`*, assigned_to:users(id, name, email)`).order('last_message_time', { ascending: false });

    if (currentUser.role === 'agent') query = query.eq('assigned_to', req.user.id);
    else query = query.eq('owner_id', req.user.id);

    const { data: contacts, error } = await query;
    if (error) throw error;

    // 🔥 React එකට තේරෙන්න Map කරනවා
    const formattedContacts = contacts.map(c => ({
        _id: c.id,
        phoneNumber: c.phone_number,
        name: c.name,
        ownerId: c.owner_id,
        assignedTo: c.assigned_to ? { _id: c.assigned_to.id, name: c.assigned_to.name, email: c.assigned_to.email } : null,
        phase: c.phase,
        callStatus: c.call_status,
        unreadCount: c.unread_count,
        attemptMethod: c.attempt_method,
        attemptCount: c.attempt_count,
        remarks: c.remarks,
        priority: c.priority,
        lastMessage: c.last_message,
        lastMessageTime: c.last_message_time,
        createdAt: c.created_at,
        updatedAt: c.created_at
    }));

    res.status(200).json(formattedContacts);

  } catch (err) {
    console.error("Fetch Contacts Error:", err);
    res.status(500).json(err);
  }
});

// Update & Delete Routes
router.put("/contact/:id", verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase.from('contacts').update(req.body).eq('id', req.params.id).select().single();
        if (error) throw error;
        res.status(200).json(data);
    } catch (err) { res.status(500).json(err); }
});

router.delete("/contact/:id", verifyToken, async (req, res) => {
    try {
        await supabase.from('contacts').delete().eq('id', req.params.id);
        res.status(200).json("Contact has been deleted...");
    } catch (err) { res.status(500).json(err); }
});

module.exports = router;