const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const admin = require('../config/firebase');

// Generate JWT Token
const generateToken = (userId, userType) => {
  return jwt.sign(
    { userId, userType },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// ============================================
// SEND OTP
// ============================================

const sendOTP = async (req, res) => {
  try {
    const { phone_number } = req.body;

    if (!phone_number) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required.'
      });
    }

    // Format phone number with country code if not already formatted
    const formattedPhone = phone_number.startsWith('+') 
      ? phone_number 
      : `+91${phone_number}`;

    // Firebase will handle OTP sending on client side
    // This endpoint is just for validation
    res.json({
      success: true,
      message: 'OTP will be sent via Firebase. Please verify on client.',
      data: {
        phone_number: formattedPhone
      }
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending OTP.',
      error: error.message
    });
  }
};

// ============================================
// VERIFY OTP AND REGISTER/LOGIN
// ============================================

const verifyOTP = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const { 
      firebase_token, 
      phone_number, 
      user_type,
      name,
      email,
      // Vendor specific fields
      shop_name,
      shop_address,
      city,
      state,
      open_time,
      close_time,
      no_of_seats,
      no_of_workers,
      latitude,
      longitude
    } = req.body;

    // Validate Firebase token
    if (!firebase_token) {
      return res.status(400).json({
        success: false,
        message: 'Firebase token is required.'
      });
    }

    // Verify Firebase token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(firebase_token);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Firebase token.',
        error: error.message
      });
    }

    // Check if phone number matches
    if (decodedToken.phone_number !== phone_number) {
      return res.status(400).json({
        success: false,
        message: 'Phone number mismatch.'
      });
    }

    await client.query('BEGIN');

    // Check if user already exists
    const existingUser = await client.query(
      'SELECT user_id, user_type, status, phone_verified FROM users WHERE phone_number = $1',
      [phone_number]
    );

    let userId;
    let isNewUser = false;
    let finalUserType = user_type || 'customer';

    if (existingUser.rows.length > 0) {
      // User exists - LOGIN
      const user = existingUser.rows[0];
      userId = user.user_id;
      finalUserType = user.user_type;

      // Update phone verification status
      await client.query(
        'UPDATE users SET phone_verified = true, updated_at = NOW() WHERE user_id = $1',
        [userId]
      );

      // Update last login in user_profiles
      await client.query(
        `UPDATE user_profiles 
         SET last_login_at = CURRENT_TIMESTAMP 
         WHERE user_id = $1 AND is_current = true`,
        [userId]
      );

    } else {
      // New user - REGISTER
      isNewUser = true;

      // Validate user type
      const validUserTypes = ['customer', 'vendor'];
      if (!validUserTypes.includes(finalUserType)) {
        finalUserType = 'customer';
      }

      // Validate required fields based on user type
      if (finalUserType === 'vendor') {
        if (!shop_name || !shop_address || !city || !open_time || !close_time) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Required fields for vendor: shop_name, shop_address, city, open_time, close_time'
          });
        }
      }

      if (!name) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Name is required for registration.'
        });
      }

      // Insert user
      const userResult = await client.query(
        `INSERT INTO users (
          phone_number, 
          email, 
          password_hash,
          role, 
          status, 
          phone_verified,
          verification_status,
          created_at
        ) VALUES ($1, $2, $3, $4, 'active', true, $5, NOW()) 
        RETURNING user_id`,
        [
          phone_number, 
          email || null,
          null, // No password for phone auth
          finalUserType,
          finalUserType === 'vendor' ? 0 : 1 // pending for vendor, approved for customer
        ]
      );

      userId = userResult.rows[0].user_id;

      // Insert user profile
      await client.query(
        `INSERT INTO user_profiles (
          user_id, 
          full_name,
          is_current,
          created_at
        ) VALUES ($1, $2, true, NOW())`,
        [userId, name]
      );

      // If vendor, create shop details
      if (finalUserType === 'vendor') {
        await client.query(
          `INSERT INTO vendor_shop_details (
            vendor_id,
            shop_name,
            shop_address,
            city,
            state,
            latitude,
            longitude,
            open_time,
            close_time,
            no_of_seats,
            no_of_workers,
            verification_status,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, NOW())`,
          [
            userId,
            shop_name,
            shop_address,
            city,
            state || 'Maharashtra',
            latitude || null,
            longitude || null,
            open_time,
            close_time,
            no_of_seats || 1,
            no_of_workers || 1
          ]
        );

        // Initialize vendor metrics
        await client.query(
          'INSERT INTO vendor_metrics (vendor_id, created_at) VALUES ($1, NOW())',
          [userId]
        );
      }
    }

    // Generate JWT token
    const token = generateToken(userId, finalUserType);

    // Get complete user data
    const userData = await client.query(
      `SELECT 
        u.user_id,
        u.phone_number,
        u.email,
        u.role,
        u.status,
        u.verification_status,
        up.full_name as name,
        vsd.shop_name,
        vsd.verification_status as shop_verification_status
      FROM users u
      LEFT JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
      LEFT JOIN vendor_shop_details vsd ON u.user_id = vsd.vendor_id
      WHERE u.user_id = $1`,
      [userId]
    );

    await client.query('COMMIT');

    const user = userData.rows[0];

    res.json({
      success: true,
      message: isNewUser ? 'Registration successful.' : 'Login successful.',
      data: {
        token,
        user: {
          user_id: user.user_id,
          phone_number: user.phone_number,
          email: user.email,
          role: user.role,
          name: user.name,
          shop_name: user.shop_name,
          verification_status: user.verification_status,
          status: user.status
        }
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying OTP.',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// ============================================
// TRADITIONAL LOGIN (For existing users with password)
// ============================================

const login = async (req, res) => {
  try {
    const { phone_number, password, user_type } = req.body;

    // Validation
    if (!phone_number || !password) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and password are required.'
      });
    }

    // Get user
    const result = await db.query(
      'SELECT user_id, password_hash, role, status, verification_status FROM users WHERE phone_number = $1',
      [phone_number]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.'
      });
    }

    const user = result.rows[0];

    // Check if password exists (for phone auth users)
    if (!user.password_hash) {
      return res.status(401).json({
        success: false,
        message: 'Please use OTP login for this account.'
      });
    }

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

    // Check user type match if provided
    if (user_type && user.role !== user_type) {
      return res.status(401).json({
        success: false,
        message: `This account is registered as ${user.role}.`
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
    const token = generateToken(user.user_id, user.role);

    // Get complete user data
    const userData = await db.query(
      `SELECT 
        u.user_id,
        u.phone_number,
        u.email,
        u.role,
        u.status,
        u.verification_status,
        up.full_name as name,
        vsd.shop_name,
        vsd.verification_status as shop_verification_status
      FROM users u
      LEFT JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
      LEFT JOIN vendor_shop_details vsd ON u.user_id = vsd.vendor_id
      WHERE u.user_id = $1`,
      [user.user_id]
    );

    const userInfo = userData.rows[0];

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        token,
        user: {
          user_id: userInfo.user_id,
          phone_number: userInfo.phone_number,
          email: userInfo.email,
          role: userInfo.role,
          name: userInfo.name,
          shop_name: userInfo.shop_name,
          verification_status: userInfo.verification_status,
          status: userInfo.status
        }
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

// ============================================
// GET CURRENT USER PROFILE
// ============================================

const getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT 
        u.user_id,
        u.phone_number,
        u.email,
        u.role,
        u.status,
        u.phone_verified,
        u.verification_status,
        up.full_name as name,
        up.city,
        up.state,
        up.gender,
        up.profile_picture,
        up.last_login_at,
        vsd.shop_name,
        vsd.shop_address,
        vsd.city as shop_city,
        vsd.state as shop_state,
        vsd.latitude,
        vsd.longitude,
        vsd.open_time,
        vsd.close_time,
        vsd.no_of_seats,
        vsd.no_of_workers,
        vsd.verification_status as shop_verification_status,
        vm.total_bookings,
        vm.average_rating,
        vm.total_reviews
      FROM users u
      LEFT JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
      LEFT JOIN vendor_shop_details vsd ON u.user_id = vsd.vendor_id
      LEFT JOIN vendor_metrics vm ON u.user_id = vm.vendor_id
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

// ============================================
// UPDATE USER PROFILE
// ============================================

const updateProfile = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const userId = req.user.userId;
    const { 
      name, 
      email,
      city, 
      state, 
      gender, 
      profile_picture,
      // Vendor shop fields
      shop_name,
      shop_address,
      shop_city,
      shop_state,
      latitude,
      longitude,
      open_time,
      close_time,
      no_of_seats,
      no_of_workers
    } = req.body;

    await client.query('BEGIN');

    // Update email in users table if provided
    if (email) {
      await client.query(
        'UPDATE users SET email = $1, updated_at = NOW() WHERE user_id = $2',
        [email, userId]
      );
    }

    // Mark current profile as not current
    await client.query(
      'UPDATE user_profiles SET is_current = false WHERE user_id = $1 AND is_current = true',
      [userId]
    );

    // Insert new profile version
    await client.query(
      `INSERT INTO user_profiles (
        user_id, 
        full_name, 
        city, 
        state, 
        gender, 
        profile_picture, 
        is_current,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW())`,
      [userId, name, city, state, gender, profile_picture]
    );

    // Update shop details if user is vendor
    if (req.user.userType === 'vendor') {
      const shopUpdates = [];
      const shopValues = [];
      let shopParamCount = 1;

      if (shop_name) {
        shopUpdates.push(`shop_name = $${shopParamCount++}`);
        shopValues.push(shop_name);
      }
      if (shop_address) {
        shopUpdates.push(`shop_address = $${shopParamCount++}`);
        shopValues.push(shop_address);
      }
      if (shop_city) {
        shopUpdates.push(`city = $${shopParamCount++}`);
        shopValues.push(shop_city);
      }
      if (shop_state) {
        shopUpdates.push(`state = $${shopParamCount++}`);
        shopValues.push(shop_state);
      }
      if (latitude !== undefined) {
        shopUpdates.push(`latitude = $${shopParamCount++}`);
        shopValues.push(latitude);
      }
      if (longitude !== undefined) {
        shopUpdates.push(`longitude = $${shopParamCount++}`);
        shopValues.push(longitude);
      }
      if (open_time) {
        shopUpdates.push(`open_time = $${shopParamCount++}`);
        shopValues.push(open_time);
      }
      if (close_time) {
        shopUpdates.push(`close_time = $${shopParamCount++}`);
        shopValues.push(close_time);
      }
      if (no_of_seats) {
        shopUpdates.push(`no_of_seats = $${shopParamCount++}`);
        shopValues.push(no_of_seats);
      }
      if (no_of_workers) {
        shopUpdates.push(`no_of_workers = $${shopParamCount++}`);
        shopValues.push(no_of_workers);
      }

      if (shopUpdates.length > 0) {
        shopUpdates.push(`updated_at = NOW()`);
        shopValues.push(userId);
        
        const shopQuery = `
          UPDATE vendor_shop_details 
          SET ${shopUpdates.join(', ')}
          WHERE vendor_id = $${shopParamCount}
        `;
        
        await client.query(shopQuery, shopValues);
      }
    }

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

// ============================================
// LOGOUT
// ============================================

const logout = async (req, res) => {
  try {
    // Update last logout time
    await db.query(
      `UPDATE user_profiles 
       SET last_login_at = CURRENT_TIMESTAMP 
       WHERE user_id = $1 AND is_current = true`,
      [req.user.userId]
    );

    res.json({
      success: true,
      message: 'Logged out successfully.'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Error logging out.',
      error: error.message
    });
  }
};

module.exports = {
  sendOTP,
  verifyOTP,
  login,
  getProfile,
  updateProfile,
  logout
};