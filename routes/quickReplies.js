const router = require("express").Router();
const QuickReply = require("../models/QuickReply");
const { verifyToken } = require("./verifyToken"); // ඔයාගේ Auth Middleware එක

// 1. CREATE NEW QUICK REPLY
router.post("/add", verifyToken, async (req, res) => {
  try {
    const newReply = new QuickReply({
      userId: req.user.id, // Log වෙලා ඉන්න කෙනාගේ ID එක
      title: req.body.title,
      message: req.body.message
    });

    const savedReply = await newReply.save();
    res.status(200).json(savedReply);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 2. GET MY QUICK REPLIES (Logged In User ගේ ඒවා විතරයි)
router.get("/my", verifyToken, async (req, res) => {
  try {
    const replies = await QuickReply.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json(replies);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 3. DELETE QUICK REPLY
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    await QuickReply.findByIdAndDelete(req.params.id);
    res.status(200).json("Quick Reply has been deleted...");
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;