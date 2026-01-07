const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  }, // මේ මැසේජ් එක අදාල Business Owner (Client)
  customerPhone: { type: String, required: true }, // Customer ගේ නම්බර් එක
  direction: { 
    type: String, 
    enum: ['inbound', 'outbound'], 
    required: true 
  }, // inbound = Customer එව්වා, outbound = Bot යැව්වා
  type: { type: String, default: 'text' }, // text, image, video...
  content: { type: String }, // මැසේජ් එක
  status: { type: String, default: 'sent' } // sent, delivered, read
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);