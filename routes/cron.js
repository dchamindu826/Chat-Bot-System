const router = require("express").Router();
const axios = require("axios");
const Broadcast = require("../models/Broadcast");
const User = require("../models/User");

// 🔥 SECURITY KEY
const CRON_SECRET = "my_secure_cron_key_123"; 

// Helper function to detect media type from URL
const getHeaderType = (url) => {
    if (!url) return null;
    const ext = url.split('.').pop().toLowerCase();
    if (['mp4', '3gp', 'mov'].includes(ext)) return 'video';
    if (['pdf', 'doc', 'docx'].includes(ext)) return 'document';
    return 'image'; // Default to image
};

router.get("/run", async (req, res) => {
  // 1. Security Check
  if (req.query.key !== CRON_SECRET) {
      return res.status(403).json({ message: "Unauthorized Cron Access" });
  }

  console.log("⏰ Cron Triggered: Checking for scheduled broadcasts...");

  try {
    const now = new Date();

    // 2. Find Pending Jobs
    // 🔥 FIX 1: Limit to 1 job at a time to prevent server overload
    const jobs = await Broadcast.find({
      status: "pending",
      scheduledTime: { $lte: now }, 
    }).limit(1);

    if (jobs.length === 0) {
        return res.status(200).json({ message: "No jobs pending" });
    }

    const job = jobs[0];

    // 🔥🔥 FIX 2: THE SAFETY LOCK (ඉතාම වැදගත්)
    // ජොබ් එක ගත්ත ගමන්ම Status එක වෙනස් කරනවා. 
    // එතකොට ඊළඟ විනාඩියේ Cron එක ආවම මේක ආයේ අල්ලන්නේ නෑ.
    job.status = "processing";
    await job.save();

    console.log(`🚀 LOCKED & Processing Campaign: ${job.name}`);

    const client = await User.findById(job.ownerId);
    if (!client || !client.whatsappConfig) {
        job.status = "failed";
        await job.save();
        return res.status(200).json({ message: "Client config missing" });
    }

    const { phoneNumberId, accessToken } = client.whatsappConfig;
    let success = 0;
    let failed = 0;

    // 3. Loop Recipients
    for (const number of job.recipients) {
        try {
            const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
            
            let body = {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: number,
            };

            // --- A. Handle Template Messages ---
            if (job.isTemplate) {
                body.type = "template";
                body.template = {
                    name: job.templateName,
                    language: { code: job.templateLanguage },
                    components: []
                };

                // Header Media
                if (job.mediaUrl) {
                    const headerType = getHeaderType(job.mediaUrl); 
                    body.template.components.push({
                        type: "header",
                        parameters: [{
                            type: headerType,
                            [headerType]: { link: job.mediaUrl }
                        }]
                    });
                }

                // Body Variables
                if (job.templateVariables && job.templateVariables.length > 0) {
                    const params = job.templateVariables.map(val => ({
                        type: "text",
                        text: val
                    }));
                    body.template.components.push({
                        type: "body",
                        parameters: params
                    });
                }
            } 
            // --- B. Handle Custom Messages ---
            else {
                body.type = job.messageType;
                if (job.messageType === 'text') {
                    body.text = { body: job.message };
                } 
                else if (['image', 'video', 'audio'].includes(job.messageType)) {
                    body[job.messageType] = { link: job.mediaUrl };
                    if (job.message && job.messageType !== 'audio') {
                        body[job.messageType].caption = job.message;
                    }
                }
                else if (job.messageType === 'document') {
                    body.document = { 
                        link: job.mediaUrl,
                        filename: "Attachment.pdf",
                        caption: job.message || ""
                    };
                }
            }

            // 4. Send Request
            await axios.post(url, body, {
                headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
            });
            
            success++;
            console.log(`✅ Sent to ${number}`);

        } catch (err) {
            console.error(`❌ Failed to ${number}:`, err.response ? err.response.data : err.message);
            failed++;
        }
    }

    // 5. Update Job Status to Completed
    job.status = "completed";
    job.successCount = success;
    job.failCount = failed;
    await job.save();

    res.status(200).json({ message: `Campaign ${job.name} processed.` });

  } catch (err) {
    console.error("Cron Error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;