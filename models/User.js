const router = require("express").Router();
const User = require("../models/User");
const { verifyTokenAndAuthorization, verifyToken } = require("../verifyToken");
const CryptoJS = require("crypto-js");

// ... (Other routes like UPDATE, DELETE...)

// ✅ 1. UPDATE WHATSAPP CONFIG (Client Settings Page එකෙන් Call කරන්න)
router.put("/update-config", verifyToken, async (req, res) => {
  try {
    // Log වෙලා ඉන්න User (Client) ගේ ID එක
    const userId = req.user.id; 
    
    // Frontend එකෙන් එවන Data
    const { phoneNumberId, accessToken } = req.body;

    // Database Update
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          "whatsappConfig.phoneNumberId": phoneNumberId,
          "whatsappConfig.accessToken": accessToken
        }
      },
      { new: true } // අලුත් Data එක Return කරන්න
    );

    res.status(200).json(updatedUser);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;