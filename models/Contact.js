const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true },
  name: { type: String, default: "Student" },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Call Report Data
  callStatus: { 
    type: String, 
    enum: ['Pending', 'Answered', 'No Answer', 'Reject', 'Call Later'], 
    default: 'Pending' 
  },

  // 🔥 Priority Auto-Logic
  messageCount: { type: Number, default: 1 }, 
  priority: { 
    type: String, 
    enum: ['High', 'Medium', 'Low'], 
    default: 'Low' 
  },

  lastMessage: { type: String },
  lastMessageTime: { type: Date, default: Date.now },
}, { timestamps: true });

ContactSchema.index({ phoneNumber: 1, ownerId: 1 }, { unique: true });
module.exports = mongoose.model("Contact", ContactSchema);