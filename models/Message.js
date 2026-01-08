const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  conversationId: { type: String }, // WhatsApp Conversation ID
  sender: { type: String }, // Phone Number
  recipient: { type: String }, // Our Number
  text: { type: String },
  type: { type: String, default: "text" },
  
  // ✅ Link to Contact Model
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  
  // ✅ Link to Business Owner (Client)
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  isBotReply: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Message", MessageSchema);