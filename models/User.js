const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: "user" }, // admin, business, user
    businessName: { type: String, default: "" },
    phone: { type: String, default: "" },
    whatsappConfig: {
      phoneNumberId: { type: String, default: "" },
      accessToken: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

// මෙන්න මේ පේළිය තමයි වැදගත්ම දේ!
// ඔයාගේ පරණ code එකේ මෙතන { } වරහන් තිබ්බද දන්නෑ. ඒකයි කෙල වුනේ.
module.exports = mongoose.model("User", UserSchema);