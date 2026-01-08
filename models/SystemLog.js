const mongoose = require('mongoose');

const SystemLogSchema = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ['ERROR', 'WARNING', 'INFO', 'SUCCESS'], 
    default: 'ERROR' 
  },
  source: { type: String, default: 'Webhook' }, // Error Source (Webhook/Auth)
  message: { type: String }, // Error Message
  metaData: { type: Object }, // Extra Details
  
  // ✅ අලුතින් එකතු කළ කොටස: Client ID එක Save කරනවා
  clientId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null 
  }

}, { timestamps: true });

module.exports = mongoose.model('SystemLog', SystemLogSchema);