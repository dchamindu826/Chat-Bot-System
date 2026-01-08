const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  
  role: { 
    type: String, 
    enum: ['admin', 'user', 'agent'], 
    default: 'user' 
  },
  
  status: { type: String, default: 'active' },
  businessName: { type: String },
  phone: { type: String },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // ✅ ME TIKA ADD KARANNA (API Settings Save wenna)
  whatsappConfig: {
    phoneNumberId: { type: String, default: "" },
    accessToken: { type: String, default: "" }
  }

}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);