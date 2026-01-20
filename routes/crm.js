const router = require("express").Router();
const Contact = require("../models/Contact");
const User = require("../models/User"); 
const { verifyToken } = require("../verifyToken");

// 1. GET ALL CONTACTS (Smart Filter)
router.get("/contacts", verifyToken, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    let query = {};

    if (currentUser.role === 'agent') {
        // Agent nam eyata assign wechcha ewa witharai
        query = { assignedTo: req.user.id };
    } else {
        // Admin nam okkoma
        query = { ownerId: req.user.id };
    }

    const contacts = await Contact.find(query)
        .populate('assignedTo', 'name email') 
        .sort({ createdAt: -1 });

    res.status(200).json(contacts);

  } catch (err) {
    console.error("Fetch Contacts Error:", err);
    res.status(500).json(err);
  }
});

// 🔥 2. UPDATE CONTACT (Fixed for Campaign Dashboard)
router.put("/contact/:id", verifyToken, async (req, res) => {
    try {
        // Frontend eken ena hama deyakma update karanawa (Phase, Status, Remarks)
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

// 4. GET SINGLE CONTACT
router.get("/contact/:id", verifyToken, async (req, res) => {
    try {
        const contact = await Contact.findById(req.params.id);
        res.status(200).json(contact);
    } catch (err) {
        res.status(500).json(err);
    }
});

// 5. UPDATE CALL STATUS (Legacy Route - if needed)
router.put("/update-status/:id", verifyToken, async (req, res) => {
    try {
        const { callStatus, remarks, attemptMethod, attemptCount, phase } = req.body;

        const updatedContact = await Contact.findByIdAndUpdate(
            req.params.id,
            { 
                $set: { 
                    callStatus: callStatus,
                    remarks: remarks || "",
                    attemptMethod: attemptMethod || "", 
                    attemptCount: attemptCount || "0",
                    phase: phase || 1 // Support Phase here too
                } 
            },
            { new: true }
        );

        res.status(200).json(updatedContact);
    } catch (err) {
        console.error("Status Update Error:", err);
        res.status(500).json(err);
    }
});

module.exports = router;