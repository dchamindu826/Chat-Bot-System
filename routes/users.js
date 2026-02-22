const router = require("express").Router();
const { createClient } = require("@supabase/supabase-js");
const CryptoJS = require("crypto-js");

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

module.exports = router;