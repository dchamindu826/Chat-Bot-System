const router = require("express").Router();
const axios = require("axios");
const User = require("../models/User");
const { verifyToken } = require("../verifyToken");

// 1. GET ALL TEMPLATES
router.get("/", verifyToken, async (req, res) => {
  try {
    const client = await User.findById(req.user.id);
    if (!client || !client.whatsappConfig) return res.status(500).json({ message: "Config Error" });

    const { wabaId, accessToken } = client.whatsappConfig; 
    if (!wabaId) return res.status(400).json({ message: "WABA ID is missing!" });

    const url = `https://graph.facebook.com/v18.0/${wabaId}/message_templates`;
    const response = await axios.get(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    res.status(200).json(response.data.data);
  } catch (err) {
    res.status(500).json(err.response ? err.response.data : "Error fetching templates");
  }
});

// 2. CREATE TEMPLATE (🔥 FIXED: Robust Payload Construction)
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
        
        // 1. Text Header
        if (headerType === 'TEXT' && headerText) {
            headerComponent.text = headerText;
        } 
        // 2. Media Header (IMAGE, VIDEO, DOCUMENT)
        else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && headerUrl) {
            headerComponent.example = { 
                header_url: [headerUrl] // URL eka Array ekak widihata
            };
        }

        components.push(headerComponent);
    }

    // --- B. BODY COMPONENT (🔥 Auto-Generate Examples for Variables) ---
    let bodyComponent = { type: "BODY", text: bodyText };
    
    // Check if body text has variables like {{1}}, {{2}}
    const variableCount = (bodyText.match(/{{/g) || []).length;
    if (variableCount > 0) {
        // Example text එකක් හදනවා (උදා: "Sample 1", "Sample 2")
        const bodyExamples = Array.from({ length: variableCount }, (_, i) => `Sample ${i + 1}`);
        bodyComponent.example = {
            body_text: [bodyExamples] // Note: Double Array required for Body Examples [['Ex1', 'Ex2']]
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

    console.log("🚀 Sending Template Payload:", JSON.stringify(body, null, 2)); // Debugging සදහා Log එකක්

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