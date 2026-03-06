const mongoose = require("mongoose");

const QuickReplySchema = new mongoose.Schema(
  {
    // කවුද මේක හැදුවේ? (Agent ගේ ID එක)
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    
    // Template එකේ නම (උදා: Welcome, Price List)
    title: { type: String, required: true },
    
    // යවන්න ඕන දිග මැසේජ් එක (Media විතරක් යවනවනම් මේක හිස් වෙන්න පුළුවන්)
    message: { type: String, required: false },

    // 🔥 NEW: Media URL and Type
    mediaUrl: { type: String, default: null },
    mediaType: { type: String, default: 'text' }
  },
  { timestamps: true }
);

module.exports = mongoose.model("QuickReply", QuickReplySchema);