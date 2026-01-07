const router = require('express').Router();
const User = require('../models/User');
const CryptoJS = require("crypto-js");
const jwt = require("jsonwebtoken");

// REGISTER
router.post("/register", async (req, res) => {
    try {
        // අලුත් Admin කෙනෙක් නම් role එක 'admin' කියලා එනවා
        const role = req.body.role || 'user'; 

        const newUser = new User({
            username: req.body.username,
            email: req.body.email,
            password: CryptoJS.AES.encrypt(req.body.password, process.env.PASS_SEC).toString(),
            role: role
        });

        const savedUser = await newUser.save();
        res.status(201).json(savedUser);
    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});

// LOGIN
router.post("/login", async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user) return res.status(401).json("Wrong credentials!");

        const hashedPassword = CryptoJS.AES.decrypt(user.password, process.env.PASS_SEC);
        const originalPassword = hashedPassword.toString(CryptoJS.enc.Utf8);

        if (originalPassword !== req.body.password) return res.status(401).json("Wrong credentials!");

        const accessToken = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "3d" }
        );

        const { password, ...others } = user._doc;
        res.status(200).json({ ...others, accessToken });
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;