const router = require("express").Router();
const supabase = require("../supabase");
const { verifyToken } = require("../verifyToken");

// 1. GET ALL CONTACTS (Smart Filter)
router.get("/contacts", verifyToken, async (req, res) => {
  try {
    // 1. Get current user info including owner_id
    const { data: currentUser, error: userErr } = await supabase
      .from('users')
      .select('role, owner_id')
      .eq('id', req.user.id)
      .single();

    if (userErr) throw userErr;

    // 🔥 WENAS KALA THANA 🔥
    // User agent kenek nam eyage owner_id eka gannawa. Owner kenek nam eyagema id eka gannawa.
    let targetOwnerId = req.user.id;
    if (currentUser.role === 'agent' && currentUser.owner_id) {
        targetOwnerId = currentUser.owner_id;
    }

    // Agent ta unath den e Owner ge serama contacts tika penawa (assigned_to filter eka ain kala)
    const { data: contacts, error: contactErr } = await supabase
        .from('contacts')
        .select('*')
        .eq('owner_id', targetOwnerId)
        .order('created_at', { ascending: false })
        .range(0, 9999);

    if (contactErr) throw contactErr;

    const formattedContacts = (contacts || []).map(c => ({
        ...c,
        _id: c.id,
        phoneNumber: c.phone_number,
        ownerId: c.owner_id,
        assignedTo: c.assigned_to,
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

// 1.5 ADD NEW CONTACT MANUALLY (තනි අංකයක් එකතු කිරීම)
router.post("/contact/add", verifyToken, async (req, res) => {
    try {
        const { phoneNumber, name } = req.body;
        
        let ownerId = req.user.id; 
        if (req.user.role && req.user.role.toLowerCase() === 'agent') {
            const { data: agentData } = await supabase.from('users').select('owner_id').eq('id', req.user.id).single();
            if (agentData && agentData.owner_id) ownerId = agentData.owner_id;
        }

        const { data: existing } = await supabase.from('contacts').select('*').eq('phone_number', phoneNumber).eq('owner_id', ownerId).single();
        if (existing) {
            return res.status(200).json({ ...existing, _id: existing.id, phoneNumber: existing.phone_number });
        }

        const { data: newContact, error } = await supabase.from('contacts').insert([{
            phone_number: phoneNumber,
            owner_id: ownerId,
            name: name || `Guest ${phoneNumber.slice(-4)}`,
            assigned_to: req.user.role === 'agent' ? req.user.id : null,
            unread_count: 0,
            last_message: "Created Manually",
            last_message_time: new Date().toISOString()
        }]).select().single();

        if (error) throw error;
        res.status(201).json({ ...newContact, _id: newContact.id, phoneNumber: newContact.phone_number });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 1.6 ADD BULK CONTACTS VIA CSV (CSV මගින් ගොඩක් එකතු කිරීම)
router.post("/contact/bulk-add", verifyToken, async (req, res) => {
    try {
        const { contacts } = req.body; // Array of { phoneNumber, name }
        if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({ message: "No contacts provided" });
        }

        let ownerId = req.user.id;
        if (req.user.role && req.user.role.toLowerCase() === 'agent') {
            const { data: agentData } = await supabase.from('users').select('owner_id').eq('id', req.user.id).single();
            if (agentData && agentData.owner_id) ownerId = agentData.owner_id;
        }

        // කලින් තියෙන නම්බර්ස් අරගෙන, Duplicate වීම නවත්වනවා
        const { data: existingContacts } = await supabase.from('contacts').select('phone_number').eq('owner_id', ownerId);
        const existingPhones = new Set((existingContacts || []).map(c => c.phone_number));

        const newContactsToInsert = [];
        const uniqueIncomingPhones = new Set(); // එකම CSV එකේ duplicate තිබ්බොත් අයින් කරන්න

        for (let c of contacts) {
            const phone = c.phoneNumber?.replace(/\D/g, '');
            if (phone && !existingPhones.has(phone) && !uniqueIncomingPhones.has(phone)) {
                uniqueIncomingPhones.add(phone);
                newContactsToInsert.push({
                    phone_number: phone,
                    owner_id: ownerId,
                    name: c.name || `Guest ${phone.slice(-4)}`,
                    assigned_to: req.user.role === 'agent' ? req.user.id : null,
                    unread_count: 0,
                    last_message: "Imported via CSV",
                    last_message_time: new Date().toISOString()
                });
            }
        }

        if (newContactsToInsert.length === 0) {
            return res.status(200).json({ message: "No new contacts were added. All numbers might already exist." });
        }

        // අලුත් ටික සේව් කරනවා
        const { data: insertedContacts, error } = await supabase.from('contacts').insert(newContactsToInsert).select();
        if (error) throw error;

        const formatted = insertedContacts.map(c => ({ ...c, _id: c.id, phoneNumber: c.phone_number }));
        res.status(201).json(formatted);

    } catch (err) {
        console.error("Bulk Insert Error:", err);
        res.status(500).json({ message: err.message });
    }
});

// 2. UPDATE CONTACT 
router.put("/contact/:id", verifyToken, async (req, res) => {
    try {
        const updateData = { ...req.body };
        if(updateData.callStatus) { updateData.call_status = updateData.callStatus; delete updateData.callStatus; }
        if(updateData.attemptMethod) { updateData.attempt_method = updateData.attemptMethod; delete updateData.attemptMethod; }
        if(updateData.attemptCount) { updateData.attempt_count = updateData.attemptCount; delete updateData.attemptCount; }

        const { data, error } = await supabase.from('contacts').update(updateData).eq('id', req.params.id).select();
        if (error) throw error;
        res.status(200).json({ ...data[0], _id: data[0].id, phoneNumber: data[0].phone_number });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// 3. DELETE CONTACT
router.delete("/contact/:id", verifyToken, async (req, res) => {
    try {
        const { error } = await supabase.from('contacts').delete().eq('id', req.params.id);
        if (error) throw error;
        res.status(200).json("Contact has been deleted...");
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// 4. GET SINGLE CONTACT
router.get("/contact/:id", verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase.from('contacts').select('*').eq('id', req.params.id).single();
        if (error) throw error;
        res.status(200).json({ ...data, _id: data.id, phoneNumber: data.phone_number });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// 5. UPDATE CALL STATUS
router.put("/update-status/:id", verifyToken, async (req, res) => {
    try {
        const { callStatus, remarks, attemptMethod, attemptCount, phase } = req.body;
        const { data, error } = await supabase.from('contacts').update({ 
                call_status: callStatus, remarks: remarks || "", attempt_method: attemptMethod || "", attempt_count: attemptCount || "0", phase: phase || 1
            }).eq('id', req.params.id).select();
        if (error) throw error;
        res.status(200).json({ ...data[0], _id: data[0].id, phoneNumber: data[0].phone_number });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;