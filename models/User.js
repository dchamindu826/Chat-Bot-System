// models/User.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: "user" }, // user, admin, agent
    
    // Me field eka aniwaryen ona Agent wa Owner ta link karanna
    ownerId: { type: String, required: false }, 
    
    businessName: { type: String, default: "" },
    phone: { type: String, default: "" },
    whatsappConfig: {
      phoneNumberId: { type: String, default: "" },
      accessToken: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);