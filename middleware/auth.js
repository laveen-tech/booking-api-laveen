const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists and is active
    const result = await db.query(
      'SELECT user_id, role, status FROM users WHERE user_id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found.'
      });
    }

    if (result.rows[0].status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'User account is inactive.'
      });
    }

    req.user = {
      userId: decoded.userId,
      userType: result.rows[0].role
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired.'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
};

// Check if user is admin or superadmin
const isAdmin = (req, res, next) => {
  if (req.user.userType !== 'admin' && req.user.userType !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }
  next();
};

// Check if user is superadmin
const isSuperAdmin = (req, res, next) => {
  if (req.user.userType !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Super admin privileges required.'
    });
  }
  next();
};

// Check if user is vendor
const isVendor = (req, res, next) => {
  if (req.user.userType !== 'vendor') {
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