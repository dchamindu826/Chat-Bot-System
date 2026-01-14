const mongoose = require("mongoose");

const BroadcastSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, default: "Campaign" },
  
  recipients: [{ type: String }], // Phone numbers array ['947...', '947...']
  
  messageType: { type: String, enum: ['text', 'image', 'video', 'document', 'audio'], default: 'text' },
  message: { type: String }, // Caption or Text Body
  mediaUrl: { type: String, default: null }, // Cloudinary URL
  
  scheduledTime: { type: Date, required: true }, // යවන්න ඕන වෙලාව
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  
  successCount: { type: Number, default: 0 },
  failCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model("Broadcast", BroadcastSchema);