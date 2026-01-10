const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  conversationId: { type: String }, 
  sender: { type: String }, // "me" or Phone Number
  recipient: { type: String }, 
  
  // Frontend eka samahara welawata 'text' illanawa, samahara welawata 'content' illanawa
  text: { type: String }, 
  content: { type: String }, 
  
  type: { type: String, default: "text" }, // image, video, text, audio
  
  // Relationships
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Message eka yawpu kenage ID eka

  direction: { type: String, enum: ['inbound', 'outbound'], default: 'outbound' },
  isBotReply: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Message", MessageSchema);