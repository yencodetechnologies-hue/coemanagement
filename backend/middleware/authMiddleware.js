const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

exports.protect = async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token provided.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id).select('-password');

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, admin no longer exists.',
      });
    }

    req.admin = admin;
    next();
  } catch (err) {
    console.error('Token verification error:', err.message);
    return res.status(401).json({
      success: false,
      message: 'Not authorized, invalid or expired token.',
    });
  }
};