const mongoose = require("mongoose");

const BotConfigSchema = new mongoose.Schema({
  // 🔥🔥🔥 UPDATE: userId Field එක එකතු කළා (StrictModeError එක නවත්වන්න)
  userId: { type: String }, 

  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  
  // Bot Steps
  replies: [
    {
      id: { type: Number },
      text: { type: String }, // Message text
      
      // Media save wenna meka ona
      media: { type: String, default: "" }, // Image/Video URL
      mediaType: { type: String, default: "text" }, // 'image', 'video', 'document'
      fileName: { type: String, default: "" }, // File name for documents
      
      type: { type: String, default: "text" } // Internal type
    }
  ],

  // Bot ON/OFF Status
  isActive: { type: Boolean, default: true }

}, { timestamps: true });

module.exports = mongoose.model("BotConfig", BotConfigSchema);