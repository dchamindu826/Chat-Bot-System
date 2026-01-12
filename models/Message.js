const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
    },
    ownerId: { // Client ID
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    text: {
      type: String,
    },
    // 🔥 MEKA THAMAI ADD KARANNA ONA KALLA
    mediaUrl: {
        type: String, 
        default: null
    },
    type: {
        type: String, // text, image, video, audio, document
        default: "text"
    },
    sender: {
      type: String,
      enum: ["me", "customer"], // 'me' = Agent/Bot, 'customer' = Client
      required: true,
    },
    isBotReply: {
        type: Boolean,
        default: false
    },
    direction: {
        type: String, // inbound or outbound
        default: "inbound"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", MessageSchema);