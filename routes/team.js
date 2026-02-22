const router = require("express").Router();
const supabase = require("../supabase");
const CryptoJS = require("crypto-js");
const { verifyToken } = require("../verifyToken");

// 1. ADD AGENT
router.post("/add-agent", verifyToken, async (req, res) => {
  try {
    if (!req.body.email || !req.body.password || !req.body.name) {
        return res.status(400).json({ message: "All fields are required!" });
    }

    // Email එක තියෙනවද බලනවා
    const { data: existingUser } = await supabase.from('users').select('id').eq('email', req.body.email).single();
    if (existingUser) return res.status(400).json({ message: "Email already exists!" });

    const encryptedPassword = CryptoJS.AES.encrypt(req.body.password, process.env.PASS_SEC).toString();

    const { data: newAgent, error } = await supabase.from('users').insert([{
      name: req.body.name,
      email: req.body.email,
      password: encryptedPassword,
      role: "agent",
      owner_id: req.user.id,
      business_name: req.user.businessName || "Agent"
    }]).select().single();

    if (error) throw error;
    res.status(201).json({ ...newAgent, _id: newAgent.id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 🔥 2. GET AGENTS LIST (WITH CORRECT COUNTS)
router.get("/agents", verifyToken, async (req, res) => {
  try {
    const { data: agents, error: agentErr } = await supabase
        .from('users')
        .select('*')
        .eq('owner_id', req.user.id)
        .eq('role', 'agent');

    if (agentErr) throw agentErr;

    const agentsWithCounts = await Promise.all((agents || []).map(async (agent) => {
        
        // 1. Total Assigned
        const { count: totalAssigned } = await supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true })
            .eq('owner_id', req.user.id)
            .eq('assigned_to', agent.id);

        // 2. Covered Count
        const { count: coveredCount } = await supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true })
            .eq('owner_id', req.user.id)
            .eq('assigned_to', agent.id)
            .neq('call_status', 'Pending');
        
        return { 
            ...agent, 
            _id: agent.id,
            leadCount: totalAssigned || 0,
            coveredCount: coveredCount || 0,
            successRate: totalAssigned > 0 ? ((coveredCount / totalAssigned) * 100).toFixed(1) : 0
        };
    }));

    res.status(200).json(agentsWithCounts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// 🔥🔥🔥 3. GET SPECIFIC AGENT PERFORMANCE
router.get("/agent-performance/:id", verifyToken, async (req, res) => {
    try {
        const agentId = req.params.id;

        const { count: totalAssigned } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('assigned_to', agentId);
        const { count: covered } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('assigned_to', agentId).neq('call_status', 'Pending');
        const { count: answered } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('assigned_to', agentId).eq('call_status', 'Answered');

        const { data: recentActivity } = await supabase
            .from('contacts')
            .select('*')
            .eq('assigned_to', agentId)
            .order('updated_at', { ascending: false })
            .limit(20);

        res.status(200).json({
            totalAssigned: totalAssigned || 0,
            covered: covered || 0,
            successRate: totalAssigned > 0 ? ((answered / totalAssigned) * 100).toFixed(1) : 0,
            recentActivity: (recentActivity || []).map(c => ({ ...c, _id: c.id, phoneNumber: c.phone_number, callStatus: c.call_status, lastMessage: c.last_message }))
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 4. UPDATE AGENT
router.put("/agent/:id", verifyToken, async (req, res) => {
  try {
    let updateData = { ...req.body };
    if (updateData.password) {
      updateData.password = CryptoJS.AES.encrypt(updateData.password, process.env.PASS_SEC).toString();
    }
    
    const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', req.params.id)
        .select();

    if (error) throw error;
    res.status(200).json({ ...data[0], _id: data[0].id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 5. DELETE AGENT
router.delete("/agent/:id", verifyToken, async (req, res) => {
  try {
    const { error: delErr } = await supabase.from('users').delete().eq('id', req.params.id);
    if (delErr) throw delErr;

    // Unassign contacts
    await supabase.from('contacts').update({ assigned_to: null }).eq('assigned_to', req.params.id);
    
    res.status(200).json("Agent has been deleted...");
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 6. ASSIGN CHATS
router.put("/assign-chats", verifyToken, async (req, res) => {
    try {
      const { contactIds, agentId } = req.body;
      const { error } = await supabase
        .from('contacts')
        .update({ assigned_to: agentId })
        .in('id', contactIds);

      if (error) throw error;
      res.status(200).json({ message: "Contacts assigned successfully!" });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
});

// 7. RESET ASSIGNMENTS
router.put("/reset-assignments", verifyToken, async (req, res) => {
    try {
        const { error } = await supabase
            .from('contacts')
            .update({ assigned_to: null })
            .eq('owner_id', req.user.id);

        if (error) throw error;
        res.status(200).json({ message: "All contacts unassigned successfully!" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;