const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Generate JWT Token
const generateToken = (userId, userType) => {
  return jwt.sign(
    { userId, userType },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Register User
const register = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const { phone_number, email, password, name, user_type, city, state, gender } = req.body;

    // Validation
    if (!phone_number || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'Phone number, password, and name are required.'
      });
    }

    // Validate user_type - should match DB enum values
    const validUserTypes = ['CUSTOMER', 'VENDOR', 'ADMIN', 'SUPERADMIN'];
    const finalUserType = validUserTypes.includes(user_type) ? user_type : 'CUSTOMER';

    await client.query('BEGIN');

    // Check if user already exists
    const existingUser = await client.query(
      'SELECT user_id FROM users WHERE phone_number = $1 OR email = $2',
      [phone_number, email]
    );

    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'User with this phone number or email already exists.'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Insert user
    const userResult = await client.query(
      `INSERT INTO users (phone_number, email, password_hash, user_type, status) 
       VALUES ($1, $2, $3, $4, 'active') 
       RETURNING user_id, user_type`,
      [phone_number, email, password_hash, finalUserType]
    );

    const userId = userResult.rows[0].user_id;

    // Insert user profile
    await client.query(
      `INSERT INTO user_profiles (user_id, name, city, state, gender, is_current) 
       VALUES ($1, $2, $3, $4, $5, true)`,
      [userId, name, city, state, gender]
    );

    // If vendor, initialize vendor metrics
    if (finalUserType === 'VENDOR') {
      await client.query(
        'INSERT INTO vendor_metrics (vendor_id) VALUES ($1)',
        [userId]
      );
    }

    await client.query('COMMIT');

    // Generate token
    const token = generateToken(userId, finalUserType);

    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: {
        user_id: userId,
        user_type: finalUserType,
        token
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering user.',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Login User
const login = async (req, res) => {
  try {
    const { phone_number, password } = req.body;

    // Validation
    if (!phone_number || !password) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and password are required.'
      });
    }

    // Get user
    const result = await db.query(
      'SELECT user_id, password_hash, user_type, status FROM users WHERE phone_number = $1',
      [phone_number]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.'
      });
    }

    const user = result.rows[0];

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.'
      });
    }

    // Update last login
    await db.query(
      `UPDATE user_profiles 
       SET last_login_at = CURRENT_TIMESTAMP 
       WHERE user_id = $1 AND is_current = true`,
      [user.user_id]
    );

    // Generate token
    const token = generateToken(user.user_id, user.user_type);

    // Get user profile
    const profileResult = await db.query(
      'SELECT name, city, state, profile_picture FROM user_profiles WHERE user_id = $1 AND is_current = true',
      [user.user_id]
    );

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        user_id: user.user_id,
        user_type: user.user_type,
        profile: profileResult.rows[0] || {},
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error logging in.',
      error: error.message
    });
  }
};

// Get Current User Profile
const getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT u.user_id, u.phone_number, u.email, u.user_type, u.status, u.phone_verified,
              up.name, up.city, up.state, up.gender, up.profile_picture, up.last_login_at
       FROM users u
       LEFT JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
       WHERE u.user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile.',
      error: error.message
    });
  }
};

// Update User Profile
const updateProfile = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const userId = req.user.userId;
    const { name, city, state, gender, profile_picture } = req.body;

    await client.query('BEGIN');

    // Mark current profile as not current
    await client.query(
      'UPDATE user_profiles SET is_current = false WHERE user_id = $1 AND is_current = true',
      [userId]
    );

    // Insert new profile version
    await client.query(
      `INSERT INTO user_profiles (user_id, name, city, state, gender, profile_picture, is_current) 
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [userId, name, city, state, gender, profile_picture]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Profile updated successfully.'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile.',
      error: error.message
    });
  } finally {
    client.release();
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile
};