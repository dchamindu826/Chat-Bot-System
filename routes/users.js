const router = require("express").Router();
const { createClient } = require("@supabase/supabase-js");
const CryptoJS = require("crypto-js");
const jwt = require("jsonwebtoken"); // මේක අලුතෙන් දාන්න
const { verifyToken } = require("../verifyToken"); // මේක අලුතෙන් දාන්න

// Supabase Connection
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Frontend එකට පරණ MongoDB format එකටම (_id) ඩේටා හදලා යවන Function එක
const formatUser = (u) => ({
    ...u,
    _id: u.id,
    businessName: u.business_name,
    whatsappConfig: {
        phoneNumberId: u.phone_number_id,
        wabaId: u.waba_id,
        accessToken: u.access_token
    }
});

// 🔥 FIX 1: GET ALL USERS (Admin settings වලදි user ලිස්ට් එක ගන්න)
router.get("/", verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase.from("users").select("*");
        if (error) throw error;
        res.status(200).json((data || []).map(formatUser));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔥 FIX 2: GHOST LOGIN (Frontend එකෙන් එන විදිහට මේක users.js එකේ තියෙන්න ඕනේ)
router.post("/ghost-login/:id", verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: "Access Denied." });

        const { data: targetUser, error } = await supabase.from('users').select('*').eq('id', req.params.id).single();
        if (error || !targetUser) return res.status(404).json({ message: "User not found" });

        const ghostToken = jwt.sign(
            { id: targetUser.id, role: targetUser.role, businessName: targetUser.business_name },
            process.env.JWT_SEC,
            { expiresIn: "1d" }
        );

        res.status(200).json({ 
            message: "Ghost Access Granted", token: ghostToken, user: { id: targetUser.id, name: targetUser.name, role: targetUser.role }
        });
    } catch (err) { res.status(500).json(err); }
});

// 1. GET ALL CLIENTS (ලිස්ට් එක පෙන්නන්න)
router.get("/clients", async (req, res) => {
    try {
        const { data, error } = await supabase.from("users").select("*").eq("role", "user");
        if (error) throw error;
        res.status(200).json((data || []).map(formatUser));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. CREATE CLIENT (අලුත් Client කෙනෙක් Register කරන්න)
router.post("/client", async (req, res) => {
    try {
        const { name, email, password, businessName, phone, whatsappConfig } = req.body;
        
        // Password එක පරණ විදිහටම Encrypt කරනවා
        const encryptedPassword = CryptoJS.AES.encrypt(password, process.env.PASS_SEC).toString();

        const { data, error } = await supabase.from("users").insert([{
            name, 
            email, 
            password: encryptedPassword, 
            phone,
            business_name: businessName,
            role: "user",
            phone_number_id: whatsappConfig?.phoneNumberId,
            waba_id: whatsappConfig?.wabaId,
            access_token: whatsappConfig?.accessToken,
            status: "active"
        }]).select();

        if (error) throw error;
        res.status(201).json(formatUser(data[0]));
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 3. UPDATE CLIENT (Edit Client එකට සහ Bot Config Update වලට)
router.put("/client/:id", async (req, res) => {
    try {
        const clientId = req.params.id;
        let updateData = { ...req.body };

        // Password වෙනස් කරනවා නම් විතරක් Encrypt කරන්න
        if (updateData.password) {
            updateData.password = CryptoJS.AES.encrypt(updateData.password, process.env.PASS_SEC).toString();
        }

        // WhatsApp Config එක වෙනම ආවොත් ඒක Flat කරලා ගන්නවා
        if (updateData.whatsappConfig) {
            updateData.phone_number_id = updateData.whatsappConfig.phoneNumberId;
            updateData.waba_id = updateData.whatsappConfig.wabaId;
            updateData.access_token = updateData.whatsappConfig.accessToken;
            delete updateData.whatsappConfig;
        }

        // Business Name එක Flat කරලා ගන්නවා
        if (updateData.businessName) {
             updateData.business_name = updateData.businessName;
             delete updateData.businessName;
        }

        const { data, error } = await supabase.from("users")
            .update(updateData)
            .eq("id", clientId)
            .select();

        if (error) throw error;
        if (!data || data.length === 0) return res.status(404).json({ message: "Client not found" });
        
        res.status(200).json(formatUser(data[0]));
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


const jwt = require("jsonwebtoken");
const supabase = require("../supabase"); // ෆයිල් එකේ උඩ Supabase import කරලා නැත්නම් මේක ඕනේ වෙනවා

router.put("/update-settings", async (req, res) => {
    try {
        const { auto_followup_enabled } = req.body;

        // 1. Frontend එකෙන් එවන Token එක ගන්නවා
        const authHeader = req.headers.token;
        if (!authHeader) return res.status(401).json({ error: "No token provided" });

        const token = authHeader.split(" ")[1] || authHeader;

        // 2. Token එක Decode කරලා අදාල User ගේ ID එක හොයාගන්නවා
        // (ඔයාගේ .env ෆයිල් එකේ තියෙන JWT Secret Key එකේ නම මෙතනට ගැලපෙන්න ඕනේ)
        const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.JWT_SEC); 
        const userId = decoded.id || decoded._id;

        if (!userId) return res.status(400).json({ error: "Invalid token data" });

        // 3. Supabase එකේ 'users' table එක Update කරනවා
        const { error } = await supabase
            .from('users')
            .update({ auto_followup_enabled: auto_followup_enabled })
            .eq('id', userId);

        if (error) {
            console.error("❌ Supabase update error:", error);
            return res.status(500).json({ error: "Database update failed" });
        }

        console.log(`✅ User ${userId} updated Auto Follow-up to: ${auto_followup_enabled}`);
        res.status(200).json({ message: "Settings updated successfully", auto_followup_enabled });

    } catch (err) {
        console.error("❌ Settings Update Error:", err);
        res.status(500).json({ error: "Server Error", details: err.message });
    }
});

module.exports = router;