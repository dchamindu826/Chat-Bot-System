const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['admin', 'user'], // admin = Super Admin, user = Business Owner
    default: 'user' 
  },
  // Business details for users
  businessName: { type: String },
  phone: { type: String, default: "" },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },

  whatsappConfig: {
    phoneNumberId: { type: String, default: "" }, // Meta Phone Number ID
    accessToken: { type: String, default: "" },   // Meta Permanent Access Token
    businessAccountId: { type: String, default: "" } // (Optional) Business ID
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);