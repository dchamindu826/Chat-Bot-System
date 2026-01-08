const jwt = require('jsonwebtoken');

// 1. Token එක හරිද බලන Function එක
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.token;
  
  if (authHeader) {
    const token = authHeader.split(" ")[1]; 

    jwt.verify(token, process.env.JWT_SEC, (err, user) => { // JWT_SEC දැම්මා
      if (err) return res.status(403).json("Token is not valid!");
      req.user = user;
      next(); 
    });
  } else {
    return res.status(401).json("You are not authenticated!");
  }
};

// 2. Token එක සහ Authorization බලන Function එක (Update/Delete වලට)
const verifyTokenAndAuthorization = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.id === req.params.id || req.user.role === 'admin') {
      next();
    } else {
      res.status(403).json("You are not allowed to do that!");
    }
  });
};

// 3. Admin ද කියලා බලන Function එක (Clients Page එකට)
const verifyTokenAndAdmin = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user && req.user.role === 'admin') {
      next();
    } else {
      return res.status(403).json("You are not allowed to do that! Admin access required.");
    }
  });
};

module.exports = { verifyToken, verifyTokenAndAuthorization, verifyTokenAndAdmin };