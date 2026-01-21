const mongoose = require("mongoose");

const QuickReplySchema = new mongoose.Schema(
  {
    // කවුද මේක හැදුවේ? (Agent ගේ ID එක)
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    
    // Template එකේ නම (උදා: Welcome, Price List)
    title: { type: String, required: true },
    
    // යවන්න ඕන දිග මැසේජ් එක
    message: { type: String, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("QuickReply", QuickReplySchema);