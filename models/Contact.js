const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true },
  name: { type: String, default: "Student" },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Call Report Data
  callStatus: { 
    type: String, 
    enum: ['Pending', 'Answered', 'No Answer', 'Reject', 'Busy', 'Callback', 'Wrong Number'], 
    default: 'Pending' 
  },
  
  // 🔥 NEW FIELDS: Attempt Data (මේවා තමයි අඩු වෙලා තිබ්බේ)
  attemptMethod: { type: String, default: "" }, // 3CX, Direct, WhatsApp
  attemptCount: { type: String, default: "0" }, // 0, 1, 2, 5+ (String දැම්මේ "5+" නිසා)
  
  remarks: { type: String, default: "" }, 

  // Priority Auto-Logic
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