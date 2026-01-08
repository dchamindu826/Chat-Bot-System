const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['admin', 'user', 'agent'], // 'agent' එකතු කළා
    default: 'user' 
  },
  status: { type: String, default: 'active' },
  businessName: { type: String },
  phone: { type: String },
  
  // ✅ අලුත් කෑල්ල: Agent කෙනෙක් නම්, එයා අයිති කාටද (Client ID)
  ownerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null 
  }
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);