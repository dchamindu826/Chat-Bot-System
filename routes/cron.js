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
    const jobs = await Broadcast.find({
      status: "pending",
      scheduledTime: { $lte: now }, 
    });

    if (jobs.length === 0) {
        return res.status(200).json({ message: "No jobs pending" });
    }

    let processedCount = 0;

    for (const job of jobs) {
      console.log(`🚀 Processing Campaign: ${job.name}`);
      
      const client = await User.findById(job.ownerId);
      if (!client || !client.whatsappConfig) {
          job.status = "failed";
          await job.save();
          continue;
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

          // 🔥🔥 NEW: Handle Template Messages
          if (job.isTemplate) {
              body.type = "template";
              body.template = {
                  name: job.templateName,
                  language: { code: job.templateLanguage },
                  components: []
              };

              // A. Handle Header Media (If Exists)
              if (job.mediaUrl) {
                  const headerType = getHeaderType(job.mediaUrl); // Detect image/video/doc
                  body.template.components.push({
                      type: "header",
                      parameters: [{
                          type: headerType,
                          [headerType]: { link: job.mediaUrl }
                      }]
                  });
              }

              // B. Handle Body Variables ({{1}}, {{2}}...)
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
          // 🔥 Handle Custom Messages (Old Logic)
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

          // 5. Send Request
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

      // 6. Update Job Status
      job.status = "completed";
      job.successCount = success;
      job.failCount = failed;
      await job.save();
      processedCount++;
    }

    res.status(200).json({ message: `Processed ${processedCount} campaigns` });

  } catch (err) {
    console.error("Cron Error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;