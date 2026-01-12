const router = require("express").Router();
const Contact = require("../models/Contact");
const User = require("../models/User"); // User model eka ona role eka check karanna
const { verifyToken } = require("../verifyToken");

// 1. GET ALL CONTACTS (Smart Filter)
router.get("/contacts", verifyToken, async (req, res) => {
  try {
    // Log wela inna user kawda kiyala balanna
    const currentUser = await User.findById(req.user.id);

    let query = {};

    if (currentUser.role === 'agent') {
        // 🔥 FIX: Agent kenek nam, eyata ASSIGN karapuwa witharak pennanna
        // Note: Database eke assignedTo eka String or ObjectId vidiyata thiyenna puluwan
        query = { assignedTo: req.user.id };
    } else {
        // 🔥 Admin nam, eya create karapu (ownerId) okkoma pennanna
        query = { ownerId: req.user.id };
    }

    // Data gannakota assignedTo user ge wisthara ekka ganna (populate)
    const contacts = await Contact.find(query)
        .populate('assignedTo', 'name email') 
        .sort({ createdAt: -1 });

    res.status(200).json(contacts);

  } catch (err) {
    console.error("Fetch Contacts Error:", err);
    res.status(500).json(err);
  }
});

// 2. UPDATE CONTACT (Agent Dashboard eke Status update karanna)
router.put("/contact/:id", verifyToken, async (req, res) => {
    try {
        const updatedContact = await Contact.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true }
        );
        res.status(200).json(updatedContact);
    } catch (err) {
        res.status(500).json(err);
    }
});

// 3. DELETE CONTACT
router.delete("/contact/:id", verifyToken, async (req, res) => {
    try {
        await Contact.findByIdAndDelete(req.params.id);
        res.status(200).json("Contact has been deleted...");
    } catch (err) {
        res.status(500).json(err);
    }
});

// 4. GET SINGLE CONTACT (Optional)
router.get("/contact/:id", verifyToken, async (req, res) => {
    try {
        const contact = await Contact.findById(req.params.id);
        res.status(200).json(contact);
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;