const router = require("express").Router();
const supabase = require("../supabase");
const { verifyToken } = require("../verifyToken");

// 1. GET ALL CONTACTS (Smart Filter)
router.get("/contacts", verifyToken, async (req, res) => {
  try {
    // Current User ගේ Role එක බලන්න Users table එකට යනවා
    const { data: currentUser, error: userErr } = await supabase
      .from('users')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (userErr) throw userErr;

    let query = supabase.from('contacts').select(`
      *,
      assignedTo:users!contacts_assigned_to_fkey(name, email)
    `);

    if (currentUser.role === 'agent') {
        // Agent nam eyata assign wechcha ewa witharai
        query = query.eq('assigned_to', req.user.id);
    } else {
        // Admin nam okkoma
        query = query.eq('owner_id', req.user.id);
    }

    const { data: contacts, error: contactErr } = await query.order('created_at', { ascending: false });

    if (contactErr) throw contactErr;

    // Frontend එක MongoDB _id format එක බලාපොරොත්තු වන නිසා map කරනවා
    const formattedContacts = (contacts || []).map(c => ({
        ...c,
        _id: c.id,
        ownerId: c.owner_id,
        assignedTo: c.assignedTo ? { ...c.assignedTo, _id: c.assigned_to } : null,
        callStatus: c.call_status,
        lastMessage: c.last_message,
        lastMessageTime: c.last_message_time,
        unreadCount: c.unread_count,
        attemptMethod: c.attempt_method,
        attemptCount: c.attempt_count
    }));

    res.status(200).json(formattedContacts);

  } catch (err) {
    console.error("Fetch Contacts Error:", err);
    res.status(500).json({ message: err.message });
  }
});

// 🔥 2. UPDATE CONTACT (Fixed for Campaign Dashboard)
router.put("/contact/:id", verifyToken, async (req, res) => {
    try {
        const updateData = { ...req.body };
        
        // Frontend එකෙන් එන CamelCase ඒවා Database එකේ Snake Case වලට හරවනවා
        if(updateData.callStatus) { updateData.call_status = updateData.callStatus; delete updateData.callStatus; }
        if(updateData.attemptMethod) { updateData.attempt_method = updateData.attemptMethod; delete updateData.attemptMethod; }
        if(updateData.attemptCount) { updateData.attempt_count = updateData.attemptCount; delete updateData.attemptCount; }

        const { data, error } = await supabase
            .from('contacts')
            .update(updateData)
            .eq('id', req.params.id)
            .select();

        if (error) throw error;
        res.status(200).json({ ...data[0], _id: data[0].id });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 3. DELETE CONTACT
router.delete("/contact/:id", verifyToken, async (req, res) => {
    try {
        const { error } = await supabase
            .from('contacts')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.status(200).json("Contact has been deleted...");
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 4. GET SINGLE CONTACT
router.get("/contact/:id", verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        res.status(200).json({ ...data, _id: data.id });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 5. UPDATE CALL STATUS (Legacy Route)
router.put("/update-status/:id", verifyToken, async (req, res) => {
    try {
        const { callStatus, remarks, attemptMethod, attemptCount, phase } = req.body;

        const { data, error } = await supabase
            .from('contacts')
            .update({ 
                call_status: callStatus,
                remarks: remarks || "",
                attempt_method: attemptMethod || "", 
                attempt_count: attemptCount || "0",
                phase: phase || 1
            })
            .eq('id', req.params.id)
            .select();

        if (error) throw error;
        res.status(200).json({ ...data[0], _id: data[0].id });
    } catch (err) {
        console.error("Status Update Error:", err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;