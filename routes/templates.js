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

// 2. CREATE TEMPLATE
router.post("/create", verifyToken, async (req, res) => {
  try {
    const { name, category, language, bodyText, headerType, headerText, footerText } = req.body;
    const client = await User.findById(req.user.id);
    const { wabaId, accessToken } = client.whatsappConfig;

    if (!wabaId) return res.status(400).json({ message: "WABA ID is missing" });

    let components = [];
    if (headerType && headerType !== 'NONE') {
        let headerComponent = { type: "HEADER", format: headerType };
        if (headerType === 'TEXT' && headerText) headerComponent.text = headerText;
        components.push(headerComponent);
    }
    components.push({ type: "BODY", text: bodyText });
    if (footerText) components.push({ type: "FOOTER", text: footerText });

    const body = {
      name: name.toLowerCase(),
      category: category,
      language: language || "en_US",
      components: components
    };

    const url = `https://graph.facebook.com/v18.0/${wabaId}/message_templates`;
    const response = await axios.post(url, body, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
    });

    res.status(201).json({ message: "Template Submitted!", data: response.data });
  } catch (err) {
    res.status(500).json(err.response ? err.response.data : "Error creating template");
  }
});

module.exports = router;