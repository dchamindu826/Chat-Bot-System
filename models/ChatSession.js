const mongoose = require("mongoose");

const ChatSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Client ID
  phoneNumber: { type: String, required: true }, // Customer Phone
  currentStep: { type: Number, default: 0 }, // දැනට ඉන්න පියවර (0, 1, 2...)
  lastActive: { type: Date, default: Date.now }
}, { timestamps: true });

// එක් Client කෙනෙක්ට එක් Number එකකින් එක Session එකයි තියෙන්න පුළුවන්
ChatSessionSchema.index({ userId: 1, phoneNumber: 1 }, { unique: true });

module.exports = mongoose.model("ChatSession", ChatSessionSchema);