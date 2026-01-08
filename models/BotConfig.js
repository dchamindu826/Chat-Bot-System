const mongoose = require("mongoose");

const BotConfigSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  
  // Bot Steps
  replies: [
    {
      id: { type: Number },
      text: { type: String }, // Message text
      
      // ✅ ME TIKA ADD KALA (Media save wenna meka ona)
      media: { type: String, default: "" }, // Image/Video URL
      mediaType: { type: String, default: "text" }, // 'image', 'video', 'document'
      fileName: { type: String, default: "" }, // File name for documents
      
      type: { type: String, default: "text" } // Internal type
    }
  ],

  // ✅ Bot ON/OFF Status
  isActive: { type: Boolean, default: true }

}, { timestamps: true });

module.exports = mongoose.model("BotConfig", BotConfigSchema);