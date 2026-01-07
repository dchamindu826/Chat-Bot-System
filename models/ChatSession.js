const mongoose = require('mongoose');

const ChatSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }, // Client ID (Business Owner)
  phoneNumber: { type: String, required: true }, // Customer's Phone Number
  currentStep: { type: Number, default: 0 }, // 0 = 1st reply, 1 = 2nd reply...
  lastActive: { type: Date, default: Date.now }
}, { timestamps: true });

// Compound index to ensure unique session per user per customer
ChatSessionSchema.index({ userId: 1, phoneNumber: 1 }, { unique: true });

module.exports = mongoose.model('ChatSession', ChatSessionSchema);