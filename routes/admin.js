const router = require("express").Router();
const supabase = require("../supabase");
const { verifyToken } = require("../verifyToken");
const cron = require('node-cron');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Backup ෆෝල්ඩර් එක හදමු
const BACKUP_DIR = path.join(__dirname, '../backups');
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// --- 1. DASHBOARD STATS API ---
router.get("/stats", verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: "Admin access required" });
        }

        // 1. Total Contacts
        const { count: totalContacts, error: contactErr } = await supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true });

        // 2. Total Agents
        const { count: totalAgents, error: agentErr } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'agent');

        // 3. Total Messages Sent (Outbound)
        const { count: totalMessages, error: msgErr } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('direction', 'outbound');

        // 4. Total Templates
        const { count: totalTemplates, error: tplErr } = await supabase
            .from('templates')
            .select('*', { count: 'exact', head: true });

        res.status(200).json({
            totalContacts: totalContacts || 0,
            totalAgents: totalAgents || 0,
            totalMessagesSent: totalMessages || 0,
            totalTemplates: totalTemplates || 0,
            systemHealth: "99.9%" // Hardcoded for now
        });

    } catch (err) {
        console.error("Dashboard Stats Error:", err);
        res.status(500).json({ message: "Failed to fetch stats" });
    }
});

// --- 2. BACKUP LOGIC ---

// Database Settings (.env එකෙන් ගන්න)
const DB_USER = process.env.POSTGRES_USER || "postgres";
const DB_PASSWORD = process.env.POSTGRES_PASSWORD || "NewSupabse_Pass10"; // .env එකේ තියෙන Password එක!
const DB_HOST = process.env.POSTGRES_HOST || "localhost"; // Docker නම් "localhost"
const DB_PORT = process.env.POSTGRES_PORT || "5432";
const DB_NAME = process.env.POSTGRES_DB || "postgres";

// Backup Function එක
const createBackup = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup_${timestamp}.sql`;
    const filePath = path.join(BACKUP_DIR, fileName);

    // 🔥 වෙනස මෙතනයි: කෙලින්ම docker exec හරහා supabase-db කන්ටේනර් එක ඇතුලෙන්ම pg_dump එක run කරනවා
    // (මේකෙදි password එකක් ඕනෙත් නෑ, pooler එකේ හැප්පෙන්නෙත් නෑ)
    const command = `docker exec supabase-db pg_dump -U postgres -d postgres -F p > "${filePath}"`;

    console.log(`⏳ Starting Auto-Backup: ${fileName}`);

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Backup Failed: ${error.message}`);
            return;
        }
        console.log(`✅ Backup Created Successfully: ${fileName}`);
        
        // පරණ Backups මකනවා (දවස් 2කට වඩා පරණ ඒවා)
        cleanupOldBackups();
    });
};

const cleanupOldBackups = () => {
    const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    fs.readdir(BACKUP_DIR, (err, files) => {
        if (err) return console.error("Error reading backup directory", err);

        files.forEach(file => {
            if (file.endsWith('.sql')) {
                const filePath = path.join(BACKUP_DIR, file);
                fs.stat(filePath, (err, stats) => {
                    if (err) return;
                    // දවස් දෙකකට වඩා පරණ නම් මකනවා
                    if (now - stats.mtime.getTime() > TWO_DAYS) {
                        fs.unlink(filePath, err => {
                            if (!err) console.log(`🗑️ Deleted old backup: ${file}`);
                        });
                    }
                });
            }
        });
    });
};

// 🛑 Cron Job එක: හැම පැය 12කට සැරයක්ම දුවනවා (0 0,12 * * *)
cron.schedule('0 0,12 * * *', () => {
    createBackup();
});

// --- 3. GET BACKUP LIST API ---
router.get("/backups", verifyToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin access required" });

    fs.readdir(BACKUP_DIR, (err, files) => {
        if (err) return res.status(500).json({ message: "Failed to read backups" });

        const backups = files.filter(f => f.endsWith('.sql')).map(file => {
            const stats = fs.statSync(path.join(BACKUP_DIR, file));
            return {
                name: file,
                size: (stats.size / (1024 * 1024)).toFixed(2) + " MB", // Size in MB
                date: stats.mtime
            };
        }).sort((a, b) => b.date - a.date); // අලුත්ම ඒවා උඩට

        res.status(200).json(backups);
    });
});

// --- 4. DOWNLOAD BACKUP API ---
router.get("/backups/download/:filename", verifyToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin access required" });

    const fileName = req.params.filename;
    const filePath = path.join(BACKUP_DIR, fileName);

    if (fs.existsSync(filePath)) {
        res.download(filePath); // ෆයිල් එක Download වෙන්න යවනවා
    } else {
        res.status(404).json({ message: "Backup file not found" });
    }
});

// Manual Backup Button (Admin ට ඕන වෙලාවක ගහන්න)
router.post("/backups/manual", verifyToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin access required" });
    
    createBackup();
    res.status(200).json({ message: "Manual backup started. It will appear in the list shortly." });
});

// --- 5. GET LIVE PM2 LOGS API ---
router.get("/logs", verifyToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin access required" });

    // pm2 logs වලින් අන්තිම පේළි 100 ගන්නවා
    exec('pm2 logs crm-backend --lines 100 --nostream', (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: "Failed to read logs", details: error.message });
        }
        // Terminal output එක string එකක් විදිහට යවනවා
        res.status(200).json({ logs: stdout || stderr });
    });
});

module.exports = router;