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

// 🔥 2. GET AGENTS LIST
router.get("/agents", verifyToken, async (req, res) => {
  try {
    const { data: agents, error: agentErr } = await supabase
        .from('users')
        .select('*')
        .eq('owner_id', req.user.id)
        .eq('role', 'agent');

    if (agentErr) throw agentErr;

    const agentsWithCounts = await Promise.all((agents || []).map(async (agent) => {
        const { count: totalAssigned } = await supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true })
            .eq('owner_id', req.user.id)
            .eq('assigned_to', agent.id);

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

// 3. GET SPECIFIC AGENT PERFORMANCE
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

// 5. DELETE AGENT (🔥 FIXED Constraint Error)
router.delete("/agent/:id", verifyToken, async (req, res) => {
  try {
    // 1. මුලින්ම Agent ට assign වෙලා තියෙන Contacts ටික Unassign කරනවා
    await supabase.from('contacts').update({ assigned_to: null }).eq('assigned_to', req.params.id);
    
    // 2. ඊටපස්සේ User ව මකනවා
    const { error: delErr } = await supabase.from('users').delete().eq('id', req.params.id);
    if (delErr) throw delErr;

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

// GET AGENT STATISTICS WITH DATE FILTER
router.get("/agent-stats", verifyToken, async (req, res) => {
    try {
        let ownerId = req.user.id;
        if (req.user.role === 'agent') {
            const { data: agentData } = await supabase.from('users').select('owner_id').eq('id', req.user.id).single();
            ownerId = agentData.owner_id;
        }

        // Frontend එකෙන් එවන සම්පූර්ණ Date + Time එක අරගෙන ලංකාවේ වෙලාවට (+05:30) හදනවා
        const { startDate, endDate } = req.query;
        
        const startIso = `${startDate}+05:30`;
        const endIso = `${endDate}+05:30`;

        // 2. Agents ලට Assign කරපු Contacts ටික විතරක් ගැනීම
        const { data: contacts } = await supabase
            .from('contacts')
            .select('id, assigned_to')
            .eq('owner_id', ownerId)
            .not('assigned_to', 'is', null);

        const contactAssignedMap = {};
        contacts?.forEach(c => contactAssignedMap[c.id] = c.assigned_to)

        // 3. අද දවසට ආපු Inbound Messages ගැනීම
        const { data: inboundMessages } = await supabase
            .from('messages')
            .select('contact_id')
            .eq('owner_id', ownerId)
            .eq('direction', 'inbound')
            .gte('created_at', startIso)
            .lte('created_at', endIso);

        // Assign කරලා තියෙන අංක වලින් ආපු අලුත් මැසේජ් ගාණ (New Numbers Received)
        const assignedInbound = (inboundMessages || []).filter(m => contactAssignedMap[m.contact_id]);
        const inboundContactIdsSet = new Set(assignedInbound.map(m => m.contact_id));
        const uniqueInboundNumbers = inboundContactIdsSet.size;

        // 4. අද දවසට යවපු Outbound Messages ගැනීම
        const { data: outboundMessages } = await supabase
            .from('messages')
            .select('id, contact_id, agent_name')
            .eq('owner_id', ownerId)
            .eq('direction', 'outbound')
            .gte('created_at', startIso)
            .lte('created_at', endIso);

        // Assign කරපු අංක වලට යවපු රිප්ලයි විතරක් පෙරා ගැනීම
        const assignedOutbound = (outboundMessages || []).filter(m => contactAssignedMap[m.contact_id]);
        
        // අර ආපු "අලුත් අංක" වලට යවපු රිප්ලයි ගාණ (Total Numbers Replied)
        const repliedToNewNumbersSet = new Set(assignedOutbound.filter(m => inboundContactIdsSet.has(m.contact_id)).map(m => m.contact_id));
        const totalRepliedToNew = repliedToNewNumbersSet.size;

        // Response Rate ගණනය
        let responseRate = 0;
        if (uniqueInboundNumbers > 0) {
            responseRate = ((totalRepliedToNew / uniqueInboundNumbers) * 100).toFixed(1);
        }

        // 5. Agent-wise Data හැදීම
        const { data: agents } = await supabase
            .from('users')
            .select('id, name')
            .eq('owner_id', ownerId)
            .eq('role', 'agent');

        let agentStats = (agents || []).map(agent => {
            // මේ Agent යවපු මැසේජ් ෆිල්ටර් කිරීම
            const agentMessages = assignedOutbound.filter(m => {
                // අලුත් මැසේජ් වල නම තියෙනවා නම් ඒකෙන් බලනවා
                if (m.agent_name && m.agent_name.trim().toLowerCase() === agent.name.trim().toLowerCase()) {
                    return true;
                }
                // පරණ මැසේජ් වල නම නැත්නම්, Contact එක Assign වෙලා ඉන්නෙ කාටද කියලා බලලා ඒකට අල්ලනවා
                if (!m.agent_name && contactAssignedMap[m.contact_id] === agent.id) {
                    return true;
                }
                return false;
            });

            return {
                agentId: agent.id,
                agentName: agent.name,
                messagesSent: agentMessages.length, // Agent යවපු මුළු මැසේජ් 4ම මෙතනට එනවා
                uniqueNumbersReplied: new Set(agentMessages.map(m => m.contact_id)).size // අංක කීයකට යැව්වද කියන එක
            };
        });

        res.status(200).json({
            summary: {
                totalInbound: uniqueInboundNumbers,
                totalReplied: totalRepliedToNew,
                rate: responseRate
            },
            agents: agentStats
        });

    } catch (err) {
        console.error("Agent Stats Error:", err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;