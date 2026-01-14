const router = require("express").Router();
const axios = require("axios");
const Broadcast = require("../models/Broadcast");
const User = require("../models/User");

// 🔥 SECURITY KEY (වෙන කවුරු හරි මේක රන් කරන එක නවත්තන්න)
const CRON_SECRET = "my_secure_cron_key_123"; 

router.get("/run", async (req, res) => {
  // 1. Security Check
  if (req.query.key !== CRON_SECRET) {
      return res.status(403).json({ message: "Unauthorized Cron Access" });
  }

  console.log("⏰ Cron Triggered: Checking for scheduled broadcasts...");

  try {
    const now = new Date();

    // 2. Find Pending Jobs (Scheduled Time is NOW or PAST)
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
          const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
          
          let body = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: number,
            type: job.messageType
          };

          // 4. 🔥 Handle MEDIA Types Correctly
          if (job.messageType === 'text') {
              body.text = { body: job.message };
          } 
          else if (job.messageType === 'image') {
              body.image = { link: job.mediaUrl };
              if(job.message) body.image.caption = job.message;
          }
          else if (job.messageType === 'video') {
              body.video = { link: job.mediaUrl };
              if(job.message) body.video.caption = job.message;
          }
          else if (job.messageType === 'document') {
              body.document = { 
                  link: job.mediaUrl,
                  filename: job.name + ".pdf", // Default filename
                  caption: job.message || ""
              };
          }
          else if (job.messageType === 'audio') {
              body.audio = { link: job.mediaUrl };
              // Note: Audio cannot have captions in WhatsApp API
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