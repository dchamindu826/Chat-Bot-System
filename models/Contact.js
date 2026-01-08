const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true }, // WhatsApp Number
  name: { type: String, default: "Unknown" }, // WhatsApp Name
  
  // මේ Contact එක අයිති මොන Business (Client) එකටද?
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // මේ Contact එක බාර දීලා තියෙන්නේ මොන Agent ට ද?
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // CRM Data
  status: { 
    type: String, 
    enum: ['New', 'Answered', 'No Answer', 'Rejected', 'Pending'], 
    default: 'New' 
  },
  priority: { 
    type: String, 
    enum: ['High', 'Medium', 'Low'], 
    default: 'Medium' 
  },
  remarks: { type: String, default: "" }, // Agent දාන Notes
  lastMessage: { type: String, default: "" },
  lastMessageTime: { type: Date, default: Date.now },

}, { timestamps: true });

// එක Client කෙනෙක්ට එක නම්බර් එකක් දෙපාරක් Save නොවෙන්න
ContactSchema.index({ phoneNumber: 1, ownerId: 1 }, { unique: true });

module.exports = mongoose.model("Contact", ContactSchema);