const router = require('express').Router();
const supabase = require('../supabase');
const { verifyTokenAndAdmin, verifyToken } = require('../verifyToken');

// 1. ADMIN OVERVIEW
router.get('/overview', verifyTokenAndAdmin, async (req, res) => {
  try {
    // 1. Get active clients count
    const { count: activeClients } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'user');

    // 2. Get total messages count
    const { count: totalMessages } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true });

    // 3. Get total errors (If table exists)
    let totalErrors = 0;
    const { count: errCount, error: errLog } = await supabase
        .from('system_logs')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'ERROR');
    if (!errLog) totalErrors = errCount;

    // 4. Get last 7 days message chart data
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const isoDate = sevenDaysAgo.toISOString();

    const { data: recentMessages } = await supabase
        .from('messages')
        .select('created_at')
        .gte('created_at', isoDate);

    // Group by date locally
    const dateCounts = {};
    if (recentMessages) {
        recentMessages.forEach(msg => {
            const d = msg.created_at.split('T')[0];
            dateCounts[d] = (dateCounts[d] || 0) + 1;
        });
    }

    const chartData = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateString = d.toISOString().split('T')[0];
        chartData.push({ name: dateString, messages: dateCounts[dateString] || 0 });
    }
    
    chartData.sort((a, b) => new Date(a.name) - new Date(b.name));

    res.status(200).json({ 
        totalMessages: totalMessages || 0, 
        activeClients: activeClients || 0, 
        totalErrors, 
        chartData 
    });
  } catch (err) { 
      res.status(500).json({ error: err.message }); 
  }
});

// 2. ADMIN LOGS
router.get('/logs', verifyTokenAndAdmin, async (req, res) => {
  try {
    const { data: logs, error } = await supabase.from('system_logs')
        .select(`*, clientId:users(id, name, business_name, phone)`)
        .order('created_at', { ascending: false })
        .limit(100);
        
    if (error) return res.status(200).json([]);

    const formattedLogs = logs.map(log => ({
        _id: log.id,
        type: log.type,
        source: log.source,
        message: log.message,
        metaData: log.meta_data,
        createdAt: log.created_at,
        clientId: log.clientId ? { 
            _id: log.clientId.id, 
            name: log.clientId.name, 
            businessName: log.clientId.business_name 
        } : null
    }));

    res.status(200).json(formattedLogs);
  } catch (err) { 
      res.status(200).json([]); 
  }
});

// 3. USER DASHBOARD STATS
router.get('/user-stats', verifyToken, async (req, res) => {
  try {
    const { phase, time } = req.query;
    const ownerId = req.user.id;
    
    // 🔥 NEW: 9 AM to 9 AM Shift Logic
    let now = new Date();
    let shiftStart = new Date(now);
    shiftStart.setHours(9, 0, 0, 0); // අද උදේ 9 ට වෙලාව හදනවා

    // දැනට තියෙන වෙලාව උදේ 9 ට අඩුයි නම් (උදා: පාන්දර 8), ඒ කියන්නේ ඊයේ උදේ 9 Shift එක තාම දුවනවා
    if (now < shiftStart) {
        shiftStart.setDate(shiftStart.getDate() - 1);
    }
    const todayIso = shiftStart.toISOString();

    // Total Calls
    let callsQuery = supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('owner_id', ownerId);
    if (phase && phase !== 'All') callsQuery = callsQuery.eq('phase', parseInt(phase));
    if (time === 'today') callsQuery = callsQuery.gte('last_message_time', todayIso); // 🔥 FIXED COLUMN NAME
    const { count: totalCalls } = await callsQuery;

    // Total Messages
    let msgsQuery = supabase.from('messages').select('*', { count: 'exact', head: true }).eq('owner_id', ownerId);
    if (time === 'today') msgsQuery = msgsQuery.gte('created_at', todayIso);
    const { count: totalMessages } = await msgsQuery;

    // Assigned Contacts
    let assignedQuery = supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('owner_id', ownerId).not('assigned_to', 'is', null);
    if (phase && phase !== 'All') assignedQuery = assignedQuery.eq('phase', parseInt(phase));
    if (time === 'today') assignedQuery = assignedQuery.gte('last_message_time', todayIso); // 🔥 FIXED COLUMN NAME
    const { count: assignedContacts } = await assignedQuery;

    // Answered Contacts
    let answeredQuery = supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('owner_id', ownerId).eq('call_status', 'Answered');
    if (phase && phase !== 'All') answeredQuery = answeredQuery.eq('phase', parseInt(phase));
    if (time === 'today') answeredQuery = answeredQuery.gte('last_message_time', todayIso); // 🔥 FIXED COLUMN NAME
    const { count: answeredContacts } = await answeredQuery;
    
    const responseRate = assignedContacts > 0 ? ((answeredContacts / assignedContacts) * 100).toFixed(1) : 0;

    res.status(200).json({ 
        totalCalls: totalCalls || 0, 
        totalMessages: totalMessages || 0, 
        responseRate 
    });
  } catch (err) { 
      res.status(500).json({ error: err.message }); 
  }
});

// 4. AGENT PERFORMANCE
router.get('/agent-performance', verifyToken, async (req, res) => {
  try {
    const { phase, time } = req.query;
    const ownerId = req.user.id;

    // 🔥 NEW: 9 AM to 9 AM Shift Logic
    let now = new Date();
    let shiftStart = new Date(now);
    shiftStart.setHours(9, 0, 0, 0); // අද උදේ 9 ට වෙලාව හදනවා

    // දැනට තියෙන වෙලාව උදේ 9 ට අඩුයි නම් (උදා: පාන්දර 8), ඒ කියන්නේ ඊයේ උදේ 9 Shift එක තාම දුවනවා
    if (now < shiftStart) {
        shiftStart.setDate(shiftStart.getDate() - 1);
    }
    const todayIso = shiftStart.toISOString();

    // 1. Get all agents for this owner
    const { data: agents, error: agentErr } = await supabase
        .from('users')
        .select('id, name')
        .eq('owner_id', ownerId)
        .eq('role', 'agent');
        
    if (agentErr) throw agentErr;

    // 2. Get all contacts for this owner
    let contactsQuery = supabase.from('contacts').select('assigned_to, call_status, attempt_count').eq('owner_id', ownerId);
    if (phase && phase !== 'All') {
        contactsQuery = contactsQuery.eq('phase', parseInt(phase));
    }
    // 🔥 NEW: Apply today filter using last_message_time
    if (time === 'today') {
        contactsQuery = contactsQuery.gte('last_message_time', todayIso); // 🔥 FIXED COLUMN NAME
    }

    const { data: contacts, error: contactErr } = await contactsQuery;
    if (contactErr) throw contactErr;

    // 3. Process Logic Locally
    const agentStats = {};
    
    (agents || []).forEach(agent => {
        agentStats[agent.id] = { id: agent.id, agentName: agent.name, totalAllocated: 0, answered: 0, noAnswer: 0, reject: 0, pending: 0 };
    });
    agentStats['unassigned'] = { id: null, agentName: "Unassigned Pool", totalAllocated: 0, answered: 0, noAnswer: 0, reject: 0, pending: 0 };

    (contacts || []).forEach(c => {
        const agentId = c.assigned_to || 'unassigned';
        if (!agentStats[agentId]) return;

        agentStats[agentId].totalAllocated += 1;
        const attempts = parseInt(c.attempt_count || 0);

        if (c.call_status === 'Answered') {
            agentStats[agentId].answered += 1;
        } else if (c.call_status === 'Reject') {
            agentStats[agentId].reject += 1;
        } else if (c.call_status === 'No Answer' || (c.call_status === 'Pending' && attempts > 0)) {
            agentStats[agentId].noAnswer += 1;
        } else if (c.call_status === 'Pending' && attempts === 0) {
            agentStats[agentId].pending += 1;
        }
    });

    // 4. Format and Calculate derived values
    const formattedStats = Object.values(agentStats).map(stat => {
        const responseRate = stat.totalAllocated > 0 ? ((stat.answered / stat.totalAllocated) * 100).toFixed(1) : 0;
        
        const totalActioned = stat.answered + stat.noAnswer + stat.reject;
        const toCover = stat.totalAllocated - totalActioned;

        return {
            id: stat.id,
            agentName: stat.agentName,
            totalAllocated: stat.totalAllocated,
            answered: stat.answered,
            noAnswer: stat.noAnswer,
            reject: stat.reject,
            responseRate: responseRate, 
            toCover: toCover < 0 ? 0 : toCover
        };
    });

    res.status(200).json(formattedStats);
  } catch (err) {
    console.error("Agent Performance Error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;