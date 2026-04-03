const router = require("express").Router();
const axios = require("axios");
const supabase = require("../supabase");
const { verifyToken } = require("../verifyToken");

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
        let metaTemplates = response.data.data;

        // 🔥 LOGGING DB FETCH 🔥
        console.log("=== FETCHING TEMPLATES FROM DB ===");
        const { data: dbTemplates, error: dbErr } = await supabase.from('templates').select('*').eq('owner_id', ownerId);
        console.log("DB Error:", dbErr);
        console.log("DB Templates Found:", dbTemplates?.length || 0);

        if (!dbErr && dbTemplates && dbTemplates.length > 0) {
            metaTemplates = metaTemplates.map(t => {
                const foundDbTemplate = dbTemplates.find(dbT => dbT.name.toLowerCase() === t.name.toLowerCase());
                if (foundDbTemplate && foundDbTemplate.media_url) {
                    t.cloudinary_url = foundDbTemplate.media_url; 
                }
                return t;
            });
        }

        res.status(200).json(metaTemplates);

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
                headerComponent.example = { header_handle: [fileHandle] };
            }
            components.push(headerComponent);
        }

        let bodyComponent = { type: "BODY", text: bodyText };
        const variableCount = (bodyText.match(/{{/g) || []).length;
        if (variableCount > 0) {
            const bodyExamples = Array.from({ length: variableCount }, (_, i) => `SampleData`);
            bodyComponent.example = { body_text: [bodyExamples] };
        }
        components.push(bodyComponent);
        
        if (footerText) components.push({ type: "FOOTER", text: footerText });

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

        // 🔥 LOGGING FOR DB INSERT 🔥
        if (response.data && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && headerUrl) {
            console.log("=== SAVING CLOUDINARY URL TO DB ===");
            console.log("Template:", name.toLowerCase(), " | URL:", headerUrl);
            
            const { data: insData, error: insErr } = await supabase.from('templates').upsert([{
                name: name.toLowerCase(),
                media_url: headerUrl,
                owner_id: ownerId
            }], { onConflict: 'name' }).select();

            if (insErr) console.error("❌ DB INSERT ERROR:", insErr);
            else console.log("✅ DB INSERT SUCCESS:", insData);
        }

        res.status(201).json({ message: "Template Submitted!", data: response.data });

    } catch (err) {
        console.error("Create Template Error:", err.response ? JSON.stringify(err.response.data) : err.message);
        res.status(500).json({ message: err.response?.data?.error?.error_user_msg || "Error creating template in Meta", details: err.response?.data });
    }
});

// 3. SEND TEMPLATE MESSAGE
router.post("/send", verifyToken, async (req, res) => {
    try {
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

        if (components && components.length > 0) {
            const updatedComponents = components.map(comp => {
                if (comp.type === 'button' || comp.type === 'buttons') {
                    return {
                        ...comp,
                        type: "button",
                        sub_type: "quick_reply",
                        index: comp.index || 0,
                        parameters: comp.parameters || [{ type: "payload", payload: `BTN_${comp.index || 0}` }]
                    };
                }
                return comp;
            });
            payload.template.components = updatedComponents;
        }

        await axios.post(url, payload, { headers });

        const sanitizedBodyText = templateBodyText ? templateBodyText.replace(/\0/g, '') : `[Template Sent: ${templateName}]`;

        const { data: savedMsg, error: insertError } = await supabase.from('messages').insert([{
            contact_id: contactId,
            owner_id: ownerId,
            text: sanitizedBodyText, 
            media_url: templateMediaUrl || null,
            sender: "me",
            direction: "outbound",
            type: templateMediaUrl ? "image" : "text"
        }]).select().single();

        await supabase.from('contacts').update({ 
            last_message: sanitizedBodyText.substring(0, 40) + "...", 
            last_message_time: new Date().toISOString() 
        }).eq('id', contactId);

        res.status(200).json(savedMsg);

    } catch (err) {
        const metaError = err.response?.data?.error?.message || "Failed to send template to Meta";
        res.status(500).json({ message: metaError, details: err.response?.data });
    }
});

// 4. DELETE TEMPLATE
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
        
        const url = `https://graph.facebook.com/v18.0/${ownerUser.waba_id}/message_templates?name=${templateName}`;
        await axios.delete(url, { headers: { Authorization: `Bearer ${ownerUser.access_token}` } });

        await supabase.from('templates').delete().eq('name', templateName).eq('owner_id', ownerId);

        res.status(200).json({ message: "Template deleted successfully from Meta!" });
    } catch (err) {
        const errorMsg = err.response?.data?.error?.message || "Failed to delete template";
        res.status(err.response?.status || 500).json({ message: errorMsg });
    }
});

module.exports = router;