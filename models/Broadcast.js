const mongoose = require("mongoose");

const BroadcastSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  recipients: [{ type: String }], // Phone Numbers Array
  scheduledTime: { type: Date, required: true },
  status: { type: String, enum: ['Pending', 'Sent', 'Failed'], default: 'Pending' }
}, { timestamps: true });

module.exports = mongoose.model("Broadcast", BroadcastSchema);