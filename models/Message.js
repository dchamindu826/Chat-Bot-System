const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  conversationId: { type: String }, // WhatsApp Conversation ID
  sender: { type: String }, // Phone Number or "me"
  recipient: { type: String }, // Our Number or Client Number
  text: { type: String },
  type: { type: String, default: "text" },
  content: { type: String }, // For Media URLs or Text display in UI
  
  // ✅ Link to Contact Model
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  
  // ✅ Link to User (Agent or Admin who sent it)
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  direction: { type: String, enum: ['inbound', 'outbound'], default: 'outbound' },
  isBotReply: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Message", MessageSchema);