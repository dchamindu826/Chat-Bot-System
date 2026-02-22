const router = require("express").Router();
const CryptoJS = require("crypto-js");
const jwt = require("jsonwebtoken");
const supabase = require("../supabase");
const { verifyToken } = require("../verifyToken");

router.post("/register", async (req, res) => {
  try {
    const { data: existingUser } = await supabase.from('users').select('*').eq('email', req.body.email).single();
    if (existingUser) return res.status(400).json({ message: "Email already exists" });

    const newUser = {
      name: req.body.name,
      email: req.body.email,
      password: CryptoJS.AES.encrypt(req.body.password, process.env.PASS_SEC).toString(),
      role: req.body.role || 'user',
      business_name: req.body.businessName || '', 
      phone: req.body.phone || ''
    };

    const { data: savedUser, error } = await supabase.from('users').insert([newUser]).select().single();
    if (error) throw error;
    res.status(201).json(savedUser);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.post("/login", async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('*').eq('email', req.body.email).single();
    if (!user) return res.status(401).json({ message: "Wrong Credentials!" });

    const hashedPassword = CryptoJS.AES.decrypt(user.password, process.env.PASS_SEC);
    const originalPassword = hashedPassword.toString(CryptoJS.enc.Utf8);

    if (originalPassword !== req.body.password) {
      return res.status(401).json({ message: "Wrong Credentials!" });
    }

    const accessToken = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SEC,
      { expiresIn: "3d" }
    );

    const { password, ...others } = user;
    res.status(200).json({ ...others, accessToken });
  } catch (err) {
    res.status(500).json({ message: "Internal Server Error", error: err.message });
  }
});

router.post("/ghost-login/:id", verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: "Access Denied. Admins only." });
        }

        const { data: targetUser } = await supabase.from('users').select('*').eq('id', req.params.id).single();
        if (!targetUser) return res.status(404).json({ message: "User not found" });

        const ghostToken = jwt.sign(
            { id: targetUser.id, role: targetUser.role, businessName: targetUser.business_name },
            process.env.JWT_SEC,
            { expiresIn: "1d" }
        );

        res.status(200).json({ 
            message: "Ghost Access Granted", token: ghostToken, user: { id: targetUser.id, name: targetUser.name, role: targetUser.role }
        });
    } catch (err) { res.status(500).json(err); }
});

module.exports = router;