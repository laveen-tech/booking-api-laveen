const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Verify JWT
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await db.query(
      'SELECT user_id, user_type, status FROM users WHERE user_id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (result.rows[0].status !== 'active') {
      return res.status(401).json({ success: false, message: 'User inactive' });
    }

    req.user = {
      userId: decoded.userId,
      userType: result.rows[0].user_type   // ✅ FIXED
    };

    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Token validation error',
      error: err.message
    });
  }
};


// Check if user is admin or superadmin
// Admin guard
const isAdmin = (req, res, next) => {
  const role = req.user.userType?.toUpperCase();  // ✅ FIXED

  if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Admin privileges required'
    });
  }

  next();
};

// Check if user is superadmin
const isSuperAdmin = (req, res, next) => {
  const role = req.user.userType?.toUpperCase();
  if (role !== 'SUPERADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Super admin privileges required.'
    });
  }
  next();
};

// Check if user is vendor
const isVendor = (req, res, next) => {
  if (req.user.userType !== 'VENDOR') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Vendor privileges required.'
    });
  }
  next();
};

// Check if user is customer
const isCustomer = (req, res, next) => {
  if (req.user.userType !== 'customer') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Customer privileges required.'
    });
  }
  next();
};

module.exports = {
  verifyToken,
  isAdmin,
  isSuperAdmin,
  isVendor,
  isCustomer
};