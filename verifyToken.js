const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.token;
  
  if (authHeader) {
    // "Bearer <token>" format එකෙන් token එක ගන්නවා
    const token = authHeader.split(" ")[1]; 

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      // 🛑 වැදගත්ම තැන: Error එකක් ආවොත් මෙතනින් නවත්වන්න (return දාන්න)
      if (err) return res.status(403).json("Token is not valid!");
      
      req.user = user;
      next(); // ඔක්කොම හරි නම් විතරක් ඉස්සරහට යන්න
    });
  } else {
    return res.status(401).json("You are not authenticated!");
  }
};

const verifyTokenAndAdmin = (req, res, next) => {
  verifyToken(req, res, () => {
    // req.user තියෙනවද කියලා check කරලා ඉන්න (Safety Check)
    if (req.user && req.user.role === 'admin') {
      next();
    } else {
      return res.status(403).json("You are not allowed to do that!");
    }
  });
};

module.exports = { verifyToken, verifyTokenAndAdmin };