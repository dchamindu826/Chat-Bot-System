const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema(
  {
    phoneNumber: { type: String, required: true, unique: true },
    name: { type: String },
    email: { type: String },
    
    // --- ME FIELD EKA THAMA MISSED WELA THIBBE ---
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // ---------------------------------------------

    lastMessage: { type: String },
    lastMessageTime: { type: Date, default: Date.now },
    unreadCount: { type: Number, default: 0 },
    
    // Campaign Status Fields
    callStatus: { 
      type: String, 
      enum: ['Pending', 'Answered', 'No Answer', 'Reject', 'Busy', 'Callback', 'Wrong Number'], 
      default: 'Pending' 
    },
    attemptMethod: { type: String, default: '' }, // 3CX, WhatsApp, Direct
    attemptCount: { type: Number, default: 0 },
    priority: { type: String, enum: ['High', 'Mid', 'Low'], default: 'Low' },
    remarks: { type: String, default: '' },
    
    tags: [{ type: String }],
    customFields: { type: Map, of: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contact", ContactSchema);