const router = require("express").Router();
const axios = require("axios");
const supabase = require("../supabase");
const { verifyToken } = require("../verifyToken");

// 🔥 HELPER: Upload File to Meta & Get Handle (For Images/Videos/Docs in Templates)
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

// 1. GET ALL TEMPLATES
router.get("/", verifyToken, async (req, res) => {
    try {
        let ownerId = req.user.id;
        
        if (req.user.role === 'agent') {
            const { data: agentData } = await supabase.from('users').select('owner_id').eq('id', req.user.id).single();
            if (agentData && agentData.owner_id) ownerId = agentData.owner_id;
        }

        const { data: ownerUser, error: ownerErr } = await supabase.from('users').select('waba_id, access_token').eq('id', ownerId).single();
        
        if (ownerErr || !ownerUser || !ownerUser.waba_id) {
            return res.status(400).json({ message: "WABA ID is not configured." });
        }

        const url = `https://graph.facebook.com/v18.0/${ownerUser.waba_id}/message_templates`;
        const response = await axios.get(url, { headers: { Authorization: `Bearer ${ownerUser.access_token}` } });

        res.status(200).json(response.data.data);

    } catch (err) {
        console.error("Fetch Templates Error:", err.response ? err.response.data : err.message);
        const errorMsg = err.response?.data?.error?.message || "Failed to fetch templates from Meta";
        res.status(err.response?.status || 500).json({ message: errorMsg });
    }
});

// 2. CREATE TEMPLATE
router.post("/create", verifyToken, async (req, res) => {
    try {
        const { name, category, language, bodyText, headerType, headerText, footerText, headerUrl, buttons } = req.body;
        
        let ownerId = req.user.id;
        if (req.user.role === 'agent') {
            const { data: agentData } = await supabase.from('users').select('owner_id').eq('id', req.user.id).single();
            if (agentData && agentData.owner_id) ownerId = agentData.owner_id;
        }

        const { data: ownerUser } = await supabase.from('users').select('waba_id, access_token').eq('id', ownerId).single();
        if (!ownerUser || !ownerUser.waba_id) {
            return res.status(400).json({ message: "WABA ID missing in settings." });
        }

        let components = [];

        // --- A. HEADER COMPONENT ---
        if (headerType && headerType !== 'NONE') {
            let headerComponent = { type: "HEADER", format: headerType };
            
            if (headerType === 'TEXT' && headerText) {
                headerComponent.text = headerText;
            } 
            else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && headerUrl) {
                const fileHandle = await uploadToMeta(headerUrl, ownerUser.access_token);
                if (!fileHandle) {
                    return res.status(400).json({ message: "Failed to upload media to Meta. Check file format/size." });
                }
                // 🔥 වෙනස: අපි header_handle එක විදිහට Meta Handle එක යවනවා.
                headerComponent.example = { header_handle: [fileHandle] };
            }
            components.push(headerComponent);
        }

        // --- B. BODY COMPONENT ---
        let bodyComponent = { type: "BODY", text: bodyText };
        
        const variableCount = (bodyText.match(/{{/g) || []).length;
        if (variableCount > 0) {
            const bodyExamples = Array.from({ length: variableCount }, (_, i) => `SampleData`);
            bodyComponent.example = { body_text: [bodyExamples] };
        }
        
        components.push(bodyComponent);
        
        // --- C. FOOTER COMPONENT ---
        if (footerText) components.push({ type: "FOOTER", text: footerText });

        // --- D. BUTTONS COMPONENT 🔥 ---
        if (buttons && Array.isArray(buttons) && buttons.length > 0) {
            let buttonComponents = buttons.map(btn => ({
                type: "QUICK_REPLY",
                text: btn.text
            }));
            components.push({ type: "BUTTONS", buttons: buttonComponents });
        }

        const body = {
            name: name.toLowerCase(),
            category: category,
            language: language || "en_US",
            components: components
        };

        const url = `https://graph.facebook.com/v18.0/${ownerUser.waba_id}/message_templates`;
        const response = await axios.post(url, body, {
            headers: { Authorization: `Bearer ${ownerUser.access_token}`, "Content-Type": "application/json" }
        });

        res.status(201).json({ message: "Template Submitted!", data: response.data });
    } catch (err) {
        console.error("Create Template Error:", err.response ? JSON.stringify(err.response.data) : err.message);
        res.status(500).json({ message: err.response?.data?.error?.error_user_msg || "Error creating template in Meta", details: err.response?.data });
    }
});

// 3. SEND TEMPLATE MESSAGE (For UserInbox)
router.post("/send", verifyToken, async (req, res) => {
    try {
        console.log("📩 Received Template Payload:", JSON.stringify(req.body, null, 2));

        const { contactId, to, templateName, language, components, templateBodyText, templateMediaUrl } = req.body;

        let recipientPhone = to;
        if (!recipientPhone && contactId) {
            const { data: contactData } = await supabase.from('contacts').select('phone_number').eq('id', contactId).single();
            if (contactData) recipientPhone = contactData.phone_number;
        }

        if (!recipientPhone) return res.status(400).json({ message: "Recipient phone number is required." });
        recipientPhone = recipientPhone.toString().replace(/\D/g, '');

        let ownerId = req.user.id;
        if (req.user.role === 'agent') {
            const { data: agentData } = await supabase.from('users').select('owner_id').eq('id', req.user.id).single();
            if (agentData && agentData.owner_id) ownerId = agentData.owner_id;
        }

        const { data: ownerUser } = await supabase.from('users').select('phone_number_id, access_token').eq('id', ownerId).single();
        if (!ownerUser || !ownerUser.phone_number_id) {
            return res.status(400).json({ message: "Phone Number ID is missing." });
        }

        const url = `https://graph.facebook.com/v17.0/${ownerUser.phone_number_id}/messages`;
        const headers = { Authorization: `Bearer ${ownerUser.access_token}`, "Content-Type": "application/json" };

        let payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: recipientPhone, 
            type: "template",
            template: {
                name: templateName,
                language: { code: language || "en_US" }
            }
        };

        // 🔥 මෙන්න මේ කෑල්ල තමයි ඔයාගේ කෝඩ් එකේ අඩු වෙලා තිබ්බේ. 
        // Buttons වලට payload එකක් නැත්නම් Meta එකෙන් deliver කරන්නේ නෑ.
        if (components && components.length > 0) {
            const updatedComponents = components.map(comp => {
                if (comp.type === 'button' || comp.type === 'buttons') {
                    return {
                        ...comp,
                        type: "button",
                        sub_type: "quick_reply", // අනිවාර්යයි
                        index: comp.index || 0,
                        parameters: comp.parameters || [{ type: "payload", payload: `BTN_${comp.index || 0}` }]
                    };
                }
                return comp;
            });
            payload.template.components = updatedComponents;
        }

        console.log(`🚀 Sending Request to Meta -> Phone: ${recipientPhone} | Template: ${templateName}`);

        // Meta එකට යවනවා
        await axios.post(url, payload, { headers });

        // 🔥 FIX FOR POSTGRESQL \u0000 ERROR (Database Crash වෙන එක නවත්තනවා)
        const sanitizedBodyText = templateBodyText ? templateBodyText.replace(/\0/g, '') : `[Template Sent: ${templateName}]`;

        // Database එකේ Save කරනවා
        const { data: savedMsg, error: insertError } = await supabase.from('messages').insert([{
            contact_id: contactId,
            owner_id: ownerId,
            text: sanitizedBodyText, 
            media_url: templateMediaUrl || null,
            sender: "me",
            direction: "outbound",
            type: templateMediaUrl ? "image" : "text"
        }]).select().single();

        if (insertError) {
            console.error("❌ DB Insert Error:", insertError);
        }

        await supabase.from('contacts').update({ 
            last_message: sanitizedBodyText.substring(0, 40) + "...", 
            last_message_time: new Date().toISOString() 
        }).eq('id', contactId);

        res.status(200).json(savedMsg);

    } catch (err) {
        console.error("❌ Send Template Error:", err.response ? JSON.stringify(err.response.data) : err.message);
        const metaError = err.response?.data?.error?.message || "Failed to send template to Meta";
        res.status(500).json({ message: metaError, details: err.response?.data });
    }
});

// 4. DELETE TEMPLATE (FROM META & CRM)
router.delete("/:name", verifyToken, async (req, res) => {
    try {
        let ownerId = req.user.id;
        if (req.user.role === 'agent') {
            const { data: agentData } = await supabase.from('users').select('owner_id').eq('id', req.user.id).single();
            if (agentData && agentData.owner_id) ownerId = agentData.owner_id;
        }

        const { data: ownerUser } = await supabase.from('users').select('waba_id, access_token').eq('id', ownerId).single();
        if (!ownerUser || !ownerUser.waba_id) {
            return res.status(400).json({ message: "WABA ID missing in settings." });
        }

        const templateName = req.params.name;
        
        // Meta API Call to Delete Template
        const url = `https://graph.facebook.com/v18.0/${ownerUser.waba_id}/message_templates?name=${templateName}`;
        await axios.delete(url, {
            headers: { Authorization: `Bearer ${ownerUser.access_token}` }
        });

        res.status(200).json({ message: "Template deleted successfully from Meta!" });
    } catch (err) {
        console.error("Delete Template Error:", err.response ? err.response.data : err.message);
        const errorMsg = err.response?.data?.error?.message || "Failed to delete template";
        res.status(err.response?.status || 500).json({ message: errorMsg });
    }
});

module.exports = router;