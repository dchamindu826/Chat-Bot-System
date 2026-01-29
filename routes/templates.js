const router = require("express").Router();
const axios = require("axios");
const User = require("../models/User");
const { verifyToken } = require("../verifyToken");

// 1. GET ALL TEMPLATES (🔥 FIXED: Simple Version with Logs)
router.get("/", verifyToken, async (req, res) => {
  try {
    const client = await User.findById(req.user.id);
    if (!client || !client.whatsappConfig) {
        console.error("❌ Config Error: User or WhatsApp Config missing");
        return res.status(500).json({ message: "Config Error" });
    }

    const { wabaId, accessToken } = client.whatsappConfig; 
    
    // Debug Logs
    console.log("🔍 Fetching Templates for WABA ID:", wabaId);

    if (!wabaId) return res.status(400).json({ message: "WABA ID is missing!" });

    // 🔥 Removed '?limit=100' (Since you have only 2 templates, default is enough)
    const url = `https://graph.facebook.com/v18.0/${wabaId}/message_templates`;
    
    const response = await axios.get(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    console.log(`✅ Success: Found ${response.data.data.length} templates`);
    
    res.status(200).json(response.data.data);

  } catch (err) {
    console.error("❌ Meta API Fetch Error:", err.response ? err.response.data : err.message);
    res.status(500).json(err.response ? err.response.data : "Error fetching templates");
  }
});

// 🔥 HELPER: Upload File to Meta & Get Handle
const uploadToMeta = async (fileUrl, accessToken) => {
    try {
        const debugRes = await axios.get(`https://graph.facebook.com/v18.0/debug_token`, {
            params: { input_token: accessToken, access_token: accessToken }
        });
        const appId = debugRes.data.data.app_id;

        const fileRes = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        const fileBuffer = Buffer.from(fileRes.data);
        const fileLength = fileBuffer.length;
        const fileType = fileRes.headers['content-type'];

        const sessionUrl = `https://graph.facebook.com/v18.0/${appId}/uploads?file_length=${fileLength}&file_type=${fileType}`;
        const sessionRes = await axios.post(sessionUrl, null, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const uploadId = sessionRes.data.id;

        const uploadUrl = `https://graph.facebook.com/v18.0/${uploadId}`;
        const handleRes = await axios.post(uploadUrl, fileBuffer, {
            headers: { 
                Authorization: `Bearer ${accessToken}`,
                "OAuth-Token": accessToken,
                "file_offset": 0 
            }
        });

        return handleRes.data.h;

    } catch (error) {
        console.error("❌ Meta Upload Failed:", error.response ? error.response.data : error.message);
        return null;
    }
};

// 2. CREATE TEMPLATE
router.post("/create", verifyToken, async (req, res) => {
  try {
    const { name, category, language, bodyText, headerType, headerText, footerText, headerUrl } = req.body;
    
    const client = await User.findById(req.user.id);
    const { wabaId, accessToken } = client.whatsappConfig;

    if (!wabaId) return res.status(400).json({ message: "WABA ID is missing" });

    let components = [];

    // --- A. HEADER COMPONENT ---
    if (headerType && headerType !== 'NONE') {
        let headerComponent = { type: "HEADER", format: headerType };
        
        if (headerType === 'TEXT' && headerText) {
            headerComponent.text = headerText;
        } 
        else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && headerUrl) {
            // Upload to Meta first
            const fileHandle = await uploadToMeta(headerUrl, accessToken);
            
            if (!fileHandle) {
                return res.status(400).json({ message: "Failed to upload media to Meta. Check file format/size." });
            }

            headerComponent.example = { 
                header_handle: [fileHandle] 
            };
        }

        components.push(headerComponent);
    }

    // --- B. BODY COMPONENT ---
    let bodyComponent = { type: "BODY", text: bodyText };
    
    const variableCount = (bodyText.match(/{{/g) || []).length;
    if (variableCount > 0) {
        const bodyExamples = Array.from({ length: variableCount }, (_, i) => `SampleData`);
        bodyComponent.example = {
            body_text: [bodyExamples] 
        };
    }
    
    components.push(bodyComponent);
    
    // --- C. FOOTER COMPONENT ---
    if (footerText) components.push({ type: "FOOTER", text: footerText });

    const body = {
      name: name.toLowerCase(),
      category: category,
      language: language || "en_US",
      components: components
    };

    console.log("🚀 Sending Template:", JSON.stringify(body, null, 2));

    const url = `https://graph.facebook.com/v18.0/${wabaId}/message_templates`;
    const response = await axios.post(url, body, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
    });

    res.status(201).json({ message: "Template Submitted!", data: response.data });
  } catch (err) {
    console.error("❌ Meta API Error:", err.response ? JSON.stringify(err.response.data) : err.message);
    res.status(500).json(err.response ? err.response.data : "Error creating template");
  }
});

module.exports = router;