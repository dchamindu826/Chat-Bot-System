// crm-backend/models/BotConfig.js
const mongoose = require('mongoose');

const BotConfigSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  replies: [
    {
      id: { type: Number },
      type: { type: String, default: 'text' },
      content: { type: String },
      media: { type: String, default: null }, // URL of image/video
      mediaType: { type: String, default: null } // 'image' or 'video'
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('BotConfig', BotConfigSchema);