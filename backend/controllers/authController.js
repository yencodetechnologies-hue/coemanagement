const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.',
      });
    }

    const admin = await Admin.findOne({ username: username.trim().toLowerCase() });

    if (!admin || !(await admin.matchPassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.',
      });
    }

    const token = generateToken(admin._id);

    res.json({
      success: true,
      message: 'Login successful.',
      token,
      admin: {
        id: admin._id,
        username: admin.username,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select('-password');
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found.' });
    }
    res.json({ success: true, admin });
  } catch (err) {
    console.error('GetMe error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};