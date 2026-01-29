const mongoose = require("mongoose");

const BroadcastSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    recipients: { type: [String], required: true }, // Phone numbers array
    
    // Scheduling
    scheduledTime: { type: Date, required: true },
    status: { type: String, default: "pending", enum: ["pending", "processing", "completed", "failed"] },
    
    // Message Type Info
    isTemplate: { type: Boolean, default: false },
    messageType: { type: String, default: "text" }, // text, image, video, document, template

    // Custom Message Data
    message: { type: String }, // For manual text
    mediaUrl: { type: String }, // For manual media or template header media

    // Template Data (New Fields)
    templateName: { type: String },
    templateLanguage: { type: String },
    templateVariables: { type: [String], default: [] }, // Stores {{1}}, {{2}} values

    // Stats
    successCount: { type: Number, default: 0 },
    failCount: { type: Number, default: 0 },
    logs: [
      {
        phone: String,
        status: String, // 'sent' or 'failed'
        error: String,
        time: { type: Date, default: Date.now }
      }
    ],
    
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Broadcast", BroadcastSchema);