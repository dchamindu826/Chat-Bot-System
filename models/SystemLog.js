const mongoose = require('mongoose');

const SystemLogSchema = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ['ERROR', 'WARNING', 'INFO', 'SUCCESS'], 
    default: 'ERROR' 
  },
  source: { type: String, default: 'Webhook' }, // කොතනින්ද අවුල ගියේ (Webhook, Auth, etc)
  message: { type: String }, // Error Message එක
  metaData: { type: Object }, // වැඩිපුර විස්තර (Phone Number, Error Code)
}, { timestamps: true });

module.exports = mongoose.model('SystemLog', SystemLogSchema);