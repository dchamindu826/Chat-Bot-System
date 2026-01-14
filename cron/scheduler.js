const cron = require("node-cron");
const axios = require("axios");
const Broadcast = require("../models/Broadcast");
const User = require("../models/User");

const startScheduler = () => {
  // හැම විනාඩියකම (Every Minute) චෙක් කරනවා
  cron.schedule("* * * * *", async () => {
    console.log("⏰ Checking for scheduled broadcasts...");

    const now = new Date();

    // 1. Pending වෙලා තියෙන, වෙලාව හරි ගිය ඒවා ගන්න
    const jobs = await Broadcast.find({
      status: "pending",
      scheduledTime: { $lte: now }, 
    });

    for (const job of jobs) {
      console.log(`🚀 Starting Broadcast: ${job.name}`);
      
      const client = await User.findById(job.ownerId);
      if (!client || !client.whatsappConfig) {
          job.status = "failed";
          await job.save();
          continue;
      }

      const { phoneNumberId, accessToken } = client.whatsappConfig;
      let success = 0;
      let failed = 0;

      // 2. Loop through recipients
      for (const number of job.recipients) {
        try {
          const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
          
          let body = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: number,
            type: job.messageType
          };

          // 3. Construct Body
          if (job.messageType === 'text') {
              body.text = { body: job.message };
          } 
          else if (['image', 'video', 'document', 'audio'].includes(job.messageType)) {
              body[job.messageType] = { link: job.mediaUrl };
              // Audio වලට caption දාන්න බෑ, අනිත් ඒවට පුළුවන්
              if (job.messageType !== 'audio' && job.message) {
                  body[job.messageType].caption = job.message;
              }
          }

          // 4. Send to Meta
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

      // 5. Finish Job
      job.status = "completed";
      job.successCount = success;
      job.failCount = failed;
      await job.save();
      console.log(`🏁 Broadcast Finished: ${success} OK, ${failed} Failed`);
    }
  });
};

module.exports = startScheduler;