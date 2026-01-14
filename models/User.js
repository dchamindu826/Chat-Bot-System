const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: "user" }, // user, admin, agent
    
    ownerId: { type: String, required: false }, 
    
    businessName: { type: String, default: "" },
    phone: { type: String, default: "" },
    status: { type: String, default: "active" }, // Active status field added just in case

    whatsappConfig: {
      phoneNumberId: { type: String, default: "" },
      wabaId: { type: String, default: "" }, // 🔥 NEW: WABA ID ADDED HERE
      accessToken: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);