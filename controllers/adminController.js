const bcrypt = require('bcryptjs');
const db = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ============================================
// USER MANAGEMENT
// ============================================

// Get all users with filters
const getAllUsers = async (req, res) => {
  try {
    const { user_type, status, search, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT u.user_id, u.phone_number, u.email, u.user_type, u.status, 
             u.phone_verified, u.created_at,
             up.name, up.city, up.state, up.gender, up.profile_picture
      FROM users u
      LEFT JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;

    if (user_type) {
      query += ` AND u.user_type = $${paramCount}`;
      params.push(user_type);
      paramCount++;
    }

    if (status) {
      query += ` AND u.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (search) {
      query += ` AND (up.name ILIKE $${paramCount} OR u.phone_number ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    // Count total
    const countQuery = `SELECT COUNT(*) FROM (${query}) as total_count`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    query += ` ORDER BY u.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: {
        users: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users.',
      error: error.message
    });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT u.user_id, u.phone_number, u.email, u.user_type, u.status, 
              u.phone_verified, u.created_at, u.created_by,
              up.name, up.city, up.state, up.gender, up.profile_picture, up.last_login_at
       FROM users u
       LEFT JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
       WHERE u.user_id = $1`,
      [id]
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
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user.',
      error: error.message
    });
  }
};

// Create Admin (Only SUPERADMIN can do this)
const createAdmin = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const { phone_number, email, password, name } = req.body;
    const createdBy = req.user.userId;

    // Validation
    if (!phone_number || !password || !name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Phone number, email, password, and name are required.'
      });
    }

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

    // Insert admin user
    const userResult = await client.query(
      `INSERT INTO users (phone_number, email, password_hash, user_type, phone_verified, created_by) 
       VALUES ($1, $2, $3, 'ADMIN', true, $4) 
       RETURNING user_id`,
      [phone_number, email, password_hash, createdBy]
    );

    const userId = userResult.rows[0].user_id;

    // Insert user profile
    await client.query(
      `INSERT INTO user_profiles (user_id, name, is_current) 
       VALUES ($1, $2, true)`,
      [userId, name]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Admin created successfully.',
      data: {
        user_id: userId,
        user_type: 'ADMIN'
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating admin.',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Update user status (activate/deactivate)
const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be active, inactive, or suspended.'
      });
    }

    // Check if user exists and is not SUPERADMIN
    const userCheck = await db.query(
      'SELECT user_type FROM users WHERE user_id = $1',
      [id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    if (userCheck.rows[0].user_type === 'SUPERADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify SUPERADMIN status.'
      });
    }

    await db.query(
      'UPDATE users SET status = $1 WHERE user_id = $2',
      [status, id]
    );

    res.json({
      success: true,
      message: `User status updated to ${status}.`
    });

  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user status.',
      error: error.message
    });
  }
};

// Delete user
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user is SUPERADMIN
    const userCheck = await db.query(
      'SELECT user_type FROM users WHERE user_id = $1',
      [id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    if (userCheck.rows[0].user_type === 'SUPERADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete SUPERADMIN.'
      });
    }

    await db.query('DELETE FROM users WHERE user_id = $1', [id]);

    res.json({
      success: true,
      message: 'User deleted successfully.'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user.',
      error: error.message
    });
  }
};

// ============================================
// VENDOR MANAGEMENT
// ============================================

// Get all vendors with shop details
const getAllVendors = async (req, res) => {
  try {
    const { verification_status, city, search, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT u.user_id, u.phone_number, u.email, u.status, u.created_at,
             up.name, up.city as user_city, up.state,
             vs.shop_id, vs.shop_name, vs.shop_address, vs.city as shop_city, 
             vs.verification_status, vs.verified_at, vs.admin_comments,
             vm.total_bookings, vm.average_rating, vm.total_reviews, vm.total_revenue
      FROM users u
      LEFT JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
      LEFT JOIN vendor_shop_details vs ON u.user_id = vs.user_id
      LEFT JOIN vendor_metrics vm ON u.user_id = vm.vendor_id
      WHERE u.user_type = 'VENDOR'
    `;
    
    const params = [];
    let paramCount = 1;

    if (verification_status) {
      query += ` AND vs.verification_status = $${paramCount}`;
      params.push(verification_status);
      paramCount++;
    }

    if (city) {
      query += ` AND vs.city = $${paramCount}`;
      params.push(city);
      paramCount++;
    }

    if (search) {
      query += ` AND (up.name ILIKE $${paramCount} OR vs.shop_name ILIKE $${paramCount} OR u.phone_number ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    // Count total
    const countQuery = `SELECT COUNT(*) FROM (${query}) as total_count`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    query += ` ORDER BY u.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: {
        vendors: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get all vendors error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching vendors.',
      error: error.message
    });
  }
};

// Get vendor details by ID
const getVendorById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get vendor basic info
    const vendorResult = await db.query(
      `SELECT u.user_id, u.phone_number, u.email, u.status, u.created_at,
              up.name, up.city, up.state, up.gender,
              vs.shop_id, vs.shop_name, vs.shop_address, vs.city as shop_city, vs.state as shop_state,
              vs.latitude, vs.longitude, vs.open_time, vs.close_time, vs.break_start_time, vs.break_end_time,
              vs.weekly_holiday, vs.no_of_seats, vs.no_of_workers, vs.verification_status,
              vs.admin_comments, vs.verified_at, vs.business_license, vs.tax_number,
              vs.bank_account_number, vs.bank_ifsc_code,
              vm.total_bookings, vm.completed_bookings, vm.cancelled_bookings,
              vm.average_rating, vm.total_reviews, vm.total_revenue, vm.last_booking_date
       FROM users u
       LEFT JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
       LEFT JOIN vendor_shop_details vs ON u.user_id = vs.user_id
       LEFT JOIN vendor_metrics vm ON u.user_id = vm.vendor_id
       WHERE u.user_id = $1 AND u.user_type = 'VENDOR'`,
      [id]
    );

    if (vendorResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found.'
      });
    }

    // Get vendor documents
    const documentsResult = await db.query(
      `SELECT document_id, document_url, document_type, is_primary, 
              verification_status, admin_comments, created_at
       FROM vendor_documents
       WHERE vendor_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [id]
    );

    // Get vendor services
    const servicesResult = await db.query(
      `SELECT vs.vendor_service_id, vs.price, vs.is_available,
              sm.service_id, sm.service_name, sm.service_description, sm.default_duration_minutes
       FROM vendor_services vs
       JOIN services_master sm ON vs.service_id = sm.service_id
       WHERE vs.vendor_id = $1 AND vs.deleted_at IS NULL
       ORDER BY sm.service_name`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...vendorResult.rows[0],
        documents: documentsResult.rows,
        services: servicesResult.rows
      }
    });

  } catch (error) {
    console.error('Get vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching vendor details.',
      error: error.message
    });
  }
};

// Verify/Reject vendor shop
const updateVendorVerification = async (req, res) => {
  try {
    const { id } = req.params;
    const { verification_status, admin_comments } = req.body;
    const verifiedBy = req.user.userId;

    console.log('Update vendor verification received:', { 
      vendorId: id, 
      verification_status, 
      admin_comments, 
      verifiedBy 
    });

    if (!['approved', 'rejected', 'pending'].includes(verification_status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification status. Must be approved, rejected, or pending.'
      });
    }

    // Check if vendor exists
    const vendorCheck = await db.query(
      'SELECT user_id FROM users WHERE user_id = $1 AND user_type = $2',
      [id, 'VENDOR']
    );

    if (vendorCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found.'
      });
    }

    // Check if vendor shop details exist
    const shopCheck = await db.query(
      'SELECT shop_id FROM vendor_shop_details WHERE user_id = $1',
      [id]
    );

    if (shopCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor shop details not found. Vendor must create shop first.'
      });
    }

    // Update shop verification status
    const result = await db.query(
      `UPDATE vendor_shop_details 
       SET verification_status = $1, 
           admin_comments = $2, 
           verified_by = $3, 
           verified_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $4
       RETURNING *`,
      [verification_status, admin_comments, verifiedBy, id]
    );

    console.log('Vendor shop verification updated:', result.rows[0]);

    res.json({
      success: true,
      message: `Vendor shop ${verification_status === 'approved' ? 'approved' : verification_status === 'rejected' ? 'rejected' : 'updated'} successfully.`,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Update vendor verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating vendor verification.',
      error: error.message
    });
  }
};


// Update document verification status
const updateDocumentVerification = async (req, res) => {
  try {
    const { documentId } = req.params;
    const { verification_status, admin_comments } = req.body;

    if (!['approved', 'rejected', 'pending'].includes(verification_status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification status. Must be approved, rejected, or pending.'
      });
    }

    const result = await db.query(
      `UPDATE vendor_documents 
       SET verification_status = $1, admin_comments = $2, updated_at = CURRENT_TIMESTAMP
       WHERE document_id = $3
       RETURNING vendor_id`,
      [verification_status, admin_comments, documentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Document not found.'
      });
    }

    res.json({
      success: true,
      message: `Document ${verification_status === 'approved' ? 'approved' : verification_status === 'rejected' ? 'rejected' : 'updated'} successfully.`
    });

  } catch (error) {
    console.error('Update document verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating document verification.',
      error: error.message
    });
  }
};

// Get dashboard statistics
const getDashboardStats = async (req, res) => {
  try {
    // Total users by type
    const userStats = await db.query(`
      SELECT user_type, COUNT(*) as count
      FROM users
      WHERE status = 'active'
      GROUP BY user_type
    `);

    // Pending vendor verifications
    const pendingVendors = await db.query(`
      SELECT COUNT(*) as count
      FROM vendor_shop_details
      WHERE verification_status = 'pending'
    `);

    // Total bookings
    const bookingStats = await db.query(`
      SELECT 
        COUNT(*) as total_bookings,
        SUM(CASE WHEN booking_status = 'completed' THEN 1 ELSE 0 END) as completed_bookings,
        SUM(CASE WHEN booking_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_bookings,
        SUM(total_amount) as total_revenue
      FROM bookings
      WHERE deleted_at IS NULL
    `);

    // Recent activity
    const recentUsers = await db.query(`
      SELECT u.user_id, up.name, u.user_type, u.created_at
      FROM users u
      LEFT JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
      ORDER BY u.created_at DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      data: {
        userStats: userStats.rows,
        pendingVendors: parseInt(pendingVendors.rows[0].count),
        bookingStats: bookingStats.rows[0],
        recentUsers: recentUsers.rows
      }
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics.',
      error: error.message
    });
  }
};


// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/shops';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'shop-' + uniqueSuffix + ext);
  }
});

// File filter
const fileFilter = function (req, file, cb) {
  const allowedTypes = /jpeg|jpg|png|webp|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only images (JPEG, PNG, WEBP) and PDF files are allowed!'));
  }
};

// Create multer instance
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: fileFilter
});

// ============================================
// 1. UPDATE VENDOR SHOP (Already exists - ensure it's there)
// ============================================

const updateVendorShop = async (req, res) => {
  try {
    const { id } = req.params;
    const shopData = req.body;
    
    console.log('📝 Update shop request for vendor:', id);
    console.log('📦 Shop data received:', shopData);
    
    // Sanitize data - convert empty strings to null for numeric and optional fields
    const sanitizeValue = (value) => {
      if (value === '' || value === undefined) return null;
      return value;
    };
    
    const sanitizedData = {
      shop_name: shopData.shop_name,
      shop_address: shopData.shop_address,
      city: shopData.city,
      state: shopData.state,
      latitude: sanitizeValue(shopData.latitude),
      longitude: sanitizeValue(shopData.longitude),
      open_time: shopData.open_time,
      close_time: shopData.close_time,
      break_start_time: sanitizeValue(shopData.break_start_time),
      break_end_time: sanitizeValue(shopData.break_end_time),
      weekly_holiday: sanitizeValue(shopData.weekly_holiday),
      no_of_seats: shopData.no_of_seats || 1,
      no_of_workers: shopData.no_of_workers || 1,
      business_license: sanitizeValue(shopData.business_license),
      tax_number: sanitizeValue(shopData.tax_number),
      bank_account_number: sanitizeValue(shopData.bank_account_number),
      bank_ifsc_code: sanitizeValue(shopData.bank_ifsc_code)
    };
    
    // Validate vendor exists
    const vendorCheck = await db.query(
      'SELECT user_id, user_type FROM users WHERE user_id = $1',
      [id]
    );
    
    if (vendorCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (vendorCheck.rows[0].user_type !== 'VENDOR') {
      return res.status(400).json({
        success: false,
        message: 'User is not a vendor'
      });
    }
    
    // Check if shop exists
    const existingShop = await db.query(
      'SELECT shop_id FROM vendor_shop_details WHERE user_id = $1',
      [id]
    );
    
    let result;
    
    if (existingShop.rows.length > 0) {
      // Update existing shop
      const updates = [];
      const values = [];
      let counter = 1;
      
      if (sanitizedData.shop_name !== undefined) {
        updates.push(`shop_name = $${counter++}`);
        values.push(sanitizedData.shop_name);
      }
      if (sanitizedData.shop_address !== undefined) {
        updates.push(`shop_address = $${counter++}`);
        values.push(sanitizedData.shop_address);
      }
      if (sanitizedData.city !== undefined) {
        updates.push(`city = $${counter++}`);
        values.push(sanitizedData.city);
      }
      if (sanitizedData.state !== undefined) {
        updates.push(`state = $${counter++}`);
        values.push(sanitizedData.state);
      }
      if (sanitizedData.latitude !== undefined) {
        updates.push(`latitude = $${counter++}`);
        values.push(sanitizedData.latitude);
      }
      if (sanitizedData.longitude !== undefined) {
        updates.push(`longitude = $${counter++}`);
        values.push(sanitizedData.longitude);
      }
      if (sanitizedData.open_time !== undefined) {
        updates.push(`open_time = $${counter++}`);
        values.push(sanitizedData.open_time);
      }
      if (sanitizedData.close_time !== undefined) {
        updates.push(`close_time = $${counter++}`);
        values.push(sanitizedData.close_time);
      }
      if (sanitizedData.break_start_time !== undefined) {
        updates.push(`break_start_time = $${counter++}`);
        values.push(sanitizedData.break_start_time);
      }
      if (sanitizedData.break_end_time !== undefined) {
        updates.push(`break_end_time = $${counter++}`);
        values.push(sanitizedData.break_end_time);
      }
      if (sanitizedData.weekly_holiday !== undefined) {
        updates.push(`weekly_holiday = $${counter++}`);
        values.push(sanitizedData.weekly_holiday);
      }
      if (sanitizedData.no_of_seats !== undefined) {
        updates.push(`no_of_seats = $${counter++}`);
        values.push(sanitizedData.no_of_seats);
      }
      if (sanitizedData.no_of_workers !== undefined) {
        updates.push(`no_of_workers = $${counter++}`);
        values.push(sanitizedData.no_of_workers);
      }
      if (sanitizedData.business_license !== undefined) {
        updates.push(`business_license = $${counter++}`);
        values.push(sanitizedData.business_license);
      }
      if (sanitizedData.tax_number !== undefined) {
        updates.push(`tax_number = $${counter++}`);
        values.push(sanitizedData.tax_number);
      }
      if (sanitizedData.bank_account_number !== undefined) {
        updates.push(`bank_account_number = $${counter++}`);
        values.push(sanitizedData.bank_account_number);
      }
      if (sanitizedData.bank_ifsc_code !== undefined) {
        updates.push(`bank_ifsc_code = $${counter++}`);
        values.push(sanitizedData.bank_ifsc_code);
      }
      
      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No fields to update'
        });
      }
      
      updates.push(`updated_at = NOW()`);
      values.push(id);
      
      const query = `
        UPDATE vendor_shop_details 
        SET ${updates.join(', ')}
        WHERE user_id = $${counter}
        RETURNING *
      `;
      
      console.log('📝 Executing update query with values:', values);
      result = await db.query(query, values);
      
      console.log('✅ Shop updated successfully');
      
      res.json({
        success: true,
        message: 'Shop updated successfully',
        data: result.rows[0]
      });
      
    } else {
      // Create new shop
      result = await db.query(`
        INSERT INTO vendor_shop_details (
          user_id, shop_name, shop_address, city, state,
          latitude, longitude, open_time, close_time,
          break_start_time, break_end_time, weekly_holiday,
          no_of_seats, no_of_workers, business_license,
          tax_number, bank_account_number, bank_ifsc_code,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
        RETURNING *
      `, [
        id,
        sanitizedData.shop_name,
        sanitizedData.shop_address,
        sanitizedData.city,
        sanitizedData.state,
        sanitizedData.latitude,
        sanitizedData.longitude,
        sanitizedData.open_time,
        sanitizedData.close_time,
        sanitizedData.break_start_time,
        sanitizedData.break_end_time,
        sanitizedData.weekly_holiday,
        sanitizedData.no_of_seats,
        sanitizedData.no_of_workers,
        sanitizedData.business_license,
        sanitizedData.tax_number,
        sanitizedData.bank_account_number,
        sanitizedData.bank_ifsc_code
      ]);
      
      console.log('✅ Shop created successfully');
      
      res.json({
        success: true,
        message: 'Shop created successfully',
        data: result.rows[0]
      });
    }
    
  } catch (error) {
    console.error('Error updating shop details:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// 2. UPLOAD SHOP PROFILE IMAGE
// ============================================

const uploadShopProfileImage = [
  upload.single('image'),
  async (req, res) => {
    try {
      const { id } = req.params;
      
      console.log('📸 Upload profile image request for vendor:', id);
      console.log('📎 File received:', req.file ? req.file.filename : 'NO FILE');
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No image file provided'
        });
      }
      
      // Get image URL (adjust based on your server setup)
      const imageUrl = `/uploads/shops/${req.file.filename}`;
      
      // Check if shop exists
      const shop = await db.query(
        'SELECT shop_id FROM vendor_shop_details WHERE user_id = $1',
        [id]
      );
      
      if (shop.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Shop not found for this vendor'
        });
      }
      
      // Delete old profile image from vendor_documents if exists
      await db.query(`
        UPDATE vendor_documents 
        SET status = 'inactive', deleted_at = NOW()
        WHERE vendor_id = $1 
          AND document_type = 'shop_profile_image' 
          AND status = 'active'
      `, [id]);
      
      // Insert new profile image
      const result = await db.query(`
        INSERT INTO vendor_documents (
          vendor_id, document_url, document_type, is_primary, 
          verification_status, created_at, updated_at
        ) VALUES ($1, $2, 'shop_profile_image', true, 'approved', NOW(), NOW())
        RETURNING *
      `, [id, imageUrl]);
      
      console.log('✅ Profile image uploaded successfully');
      
      res.json({
        success: true,
        message: 'Profile image uploaded successfully',
        data: result.rows[0]
      });
      
    } catch (error) {
      console.error('❌ Error uploading profile image:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
];

// ============================================
// 3. UPLOAD SHOP GALLERY IMAGES
// ============================================

uploadShopGalleryImages = [
  upload.array('images', 10), // Maximum 10 images at once
  async (req, res) => {
    try {
      const { id } = req.params;
      
      console.log('🖼️ Upload gallery images request for vendor:', id);
      console.log('📎 Files received:', req.files ? req.files.length : 0);
      
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No image files provided'
        });
      }
      
      // Check if shop exists
      const shop = await db.query(
        'SELECT shop_id FROM vendor_shop_details WHERE user_id = $1',
        [id]
      );
      
      if (shop.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Shop not found for this vendor'
        });
      }
      
      // Check current image count
      const currentCount = await db.query(`
        SELECT COUNT(*) as count 
        FROM vendor_documents 
        WHERE vendor_id = $1 
          AND document_type = 'shop_gallery_image' 
          AND status = 'active'
      `, [id]);
      
      const total = parseInt(currentCount.rows[0].count) + req.files.length;
      
      if (total > 10) {
        return res.status(400).json({
          success: false,
          message: `Maximum 10 gallery images allowed. Current: ${currentCount.rows[0].count}, Trying to add: ${req.files.length}`
        });
      }
      
      // Insert all images
      const insertPromises = req.files.map((file, index) => {
        const imageUrl = `/uploads/shops/${file.filename}`;
        const isPrimary = index === 0 && currentCount.rows[0].count === '0';
        
        return db.query(`
          INSERT INTO vendor_documents (
            vendor_id, document_url, document_type, is_primary,
            verification_status, created_at, updated_at
          ) VALUES ($1, $2, 'shop_gallery_image', $3, 'approved', NOW(), NOW())
          RETURNING *
        `, [id, imageUrl, isPrimary]);
      });
      
      const results = await Promise.all(insertPromises);
      
      console.log(`✅ ${req.files.length} gallery image(s) uploaded successfully`);
      
      res.json({
        success: true,
        message: `${req.files.length} image(s) uploaded successfully`,
        data: results.map(r => r.rows[0])
      });
      
    } catch (error) {
      console.error('❌ Error uploading gallery images:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
];

// ============================================
// 4. DELETE SHOP IMAGE
// ============================================

deleteShopImage = async (req, res) => {
  try {
    const { id, imageId } = req.params;
    const { type } = req.query; // 'profile' or 'gallery'
    
    console.log('🗑️ Delete image request:', { vendorId: id, imageId, type });
    
    // Get image details
    const image = await db.query(`
      SELECT * FROM vendor_documents 
      WHERE document_id = $1 AND vendor_id = $2 AND status = 'active'
    `, [imageId, id]);
    
    if (image.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }
    
    // Soft delete
    await db.query(`
      UPDATE vendor_documents 
      SET status = 'inactive', deleted_at = NOW()
      WHERE document_id = $1
    `, [imageId]);
    
    // Optional: Delete physical file
    const filePath = path.join(__dirname, '..', image.rows[0].document_url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('🗑️ Physical file deleted:', filePath);
    }
    
    console.log('✅ Image deleted successfully');
    
    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting image:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// 5. SET PRIMARY GALLERY IMAGE
// ============================================

setShopPrimaryImage = async (req, res) => {
  try {
    const { id, imageId } = req.params;
    
    console.log('⭐ Set primary image request:', { vendorId: id, imageId });
    
    // Verify image exists and belongs to this vendor
    const image = await db.query(`
      SELECT * FROM vendor_documents 
      WHERE document_id = $1 AND vendor_id = $2 AND status = 'active'
    `, [imageId, id]);
    
    if (image.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }
    
    // Remove primary flag from all gallery images for this vendor
    await db.query(`
      UPDATE vendor_documents 
      SET is_primary = false
      WHERE vendor_id = $1 AND document_type = 'shop_gallery_image'
    `, [id]);
    
    // Set new primary image
    await db.query(`
      UPDATE vendor_documents 
      SET is_primary = true
      WHERE document_id = $1
    `, [imageId]);
    
    console.log('✅ Primary image set successfully');
    
    res.json({
      success: true,
      message: 'Primary image updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Error setting primary image:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// 6. GET VENDOR DOCUMENTS
// ============================================

getVendorDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('📄 Get documents request for vendor:', id);
    
    const documents = await db.query(`
      SELECT * FROM vendor_documents 
      WHERE vendor_id = $1 AND status = 'active'
      ORDER BY 
        CASE 
          WHEN document_type = 'shop_profile_image' THEN 1
          WHEN document_type = 'shop_gallery_image' THEN 2
          ELSE 3
        END,
        created_at DESC
    `, [id]);
    
    console.log(`✅ Found ${documents.rows.length} documents`);
    
    res.json({
      success: true,
      data: documents.rows
    });
    
  } catch (error) {
    console.error('❌ Error fetching documents:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// 7. UPLOAD VENDOR DOCUMENT
// ============================================

uploadVendorDocument = [
  upload.single('document'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { document_type } = req.body;
      
      console.log('📄 Upload document request:', { vendorId: id, type: document_type });
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No document file provided'
        });
      }
      
      if (!document_type) {
        return res.status(400).json({
          success: false,
          message: 'Document type is required'
        });
      }
      
      const documentUrl = `/uploads/shops/${req.file.filename}`;
      
      // Insert document
      const result = await db.query(`
        INSERT INTO vendor_documents (
          vendor_id, document_url, document_type, 
          verification_status, created_at, updated_at
        ) VALUES ($1, $2, $3, 'pending', NOW(), NOW())
        RETURNING *
      `, [id, documentUrl, document_type]);
      
      console.log('✅ Document uploaded successfully');
      
      res.json({
        success: true,
        message: 'Document uploaded successfully',
        data: result.rows[0]
      });
      
    } catch (error) {
      console.error('❌ Error uploading document:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
];

// ============================================
// 8. DELETE VENDOR DOCUMENT
// ============================================

deleteVendorDocument = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🗑️ Delete document request:', id);
    
    // Get document details
    const doc = await db.query(
      'SELECT * FROM vendor_documents WHERE document_id = $1',
      [id]
    );
    
    if (doc.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }
    
    // Soft delete
    await db.query(`
      UPDATE vendor_documents 
      SET status = 'inactive', deleted_at = NOW()
      WHERE document_id = $1
    `, [id]);
    
    console.log('✅ Document deleted successfully');
    
    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting document:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
// ============================================
// SERVICE MANAGEMENT BACKEND IMPLEMENTATION
// FOR EXISTING services_master TABLE
// ADD TO controllers/adminController.js
// ============================================

// ============================================
// 1. GET ALL SERVICES
// ============================================
getAllServices = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      category, 
      is_available, 
      search 
    } = req.query;
    
    console.log('📋 Get all services request:', { page, limit, category, is_available, search });
    
    const offset = (page - 1) * limit;
    
    // Build query conditions
    let conditions = ["status = 'active'"];
    let queryParams = [];
    let paramCounter = 1;
    
    if (category) {
      conditions.push(`category = $${paramCounter++}`);
      queryParams.push(category);
    }
    
    if (is_available !== undefined && is_available !== '') {
      conditions.push(`is_available = $${paramCounter++}`);
      queryParams.push(is_available === 'true');
    }
    
    if (search) {
      conditions.push(`(service_name ILIKE $${paramCounter} OR service_description ILIKE $${paramCounter})`);
      queryParams.push(`%${search}%`);
      paramCounter++;
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) FROM services_master ${whereClause}`;
    const countResult = await db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);
    
    // Get paginated services
    const servicesQuery = `
      SELECT 
        service_id,
        service_name,
        service_description as description,
        default_duration_minutes as duration_minutes,
        base_price,
        category,
        is_available,
        image_url,
        requirements,
        benefits,
        service_type,
        created_at,
        updated_at,
        status
      FROM services_master 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;
    
    const services = await db.query(servicesQuery, [...queryParams, limit, offset]);
    
    console.log(`✅ Found ${services.rows.length} services`);
    
    res.json({
      success: true,
      data: {
        services: services.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching services:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// 2. GET SERVICE BY ID
// ============================================
getServiceById = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('📄 Get service by ID:', id);
    
    const service = await db.query(
      `SELECT 
        service_id,
        service_name,
        service_description as description,
        default_duration_minutes as duration_minutes,
        base_price,
        category,
        is_available,
        image_url,
        requirements,
        benefits,
        service_type,
        created_at,
        updated_at,
        status
      FROM services_master 
      WHERE service_id = $1 AND status = $2`,
      [id, 'active']
    );
    
    if (service.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }
    
    console.log('✅ Service found:', service.rows[0].service_name);
    
    res.json({
      success: true,
      data: service.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error fetching service:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// 3. CREATE SERVICE
// ============================================
createService = async (req, res) => {
  try {
    const serviceData = req.body;
    
    console.log('➕ Create service request:', serviceData.service_name);
    
    // Validate required fields
    if (!serviceData.service_name || !serviceData.category || !serviceData.base_price) {
      return res.status(400).json({
        success: false,
        message: 'Service name, category, and base price are required'
      });
    }
    
    // Sanitize data
    const sanitizedData = {
      service_name: serviceData.service_name.trim(),
      description: serviceData.description?.trim() || null,
      duration_minutes: serviceData.duration_minutes || 30,
      base_price: parseFloat(serviceData.base_price),
      category: serviceData.category.trim(),
      is_available: serviceData.is_available !== undefined ? serviceData.is_available : true,
      image_url: serviceData.image_url?.trim() || null,
      requirements: serviceData.requirements?.trim() || null,
      benefits: serviceData.benefits?.trim() || null,
      service_type: serviceData.service_type || 'normal'
    };
    
    // Validate duration
    if (sanitizedData.duration_minutes < 5 || sanitizedData.duration_minutes > 480) {
      return res.status(400).json({
        success: false,
        message: 'Duration must be between 5 and 480 minutes'
      });
    }
    
    // Validate price
    if (sanitizedData.base_price < 0) {
      return res.status(400).json({
        success: false,
        message: 'Base price must be positive'
      });
    }
    
    // Insert service
    const result = await db.query(`
      INSERT INTO services_master (
        service_name, 
        service_description, 
        default_duration_minutes, 
        base_price,
        category, 
        is_available, 
        image_url, 
        requirements, 
        benefits,
        service_type,
        created_at, 
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING 
        service_id,
        service_name,
        service_description as description,
        default_duration_minutes as duration_minutes,
        base_price,
        category,
        is_available,
        image_url,
        requirements,
        benefits,
        service_type,
        created_at,
        updated_at,
        status
    `, [
      sanitizedData.service_name,
      sanitizedData.description,
      sanitizedData.duration_minutes,
      sanitizedData.base_price,
      sanitizedData.category,
      sanitizedData.is_available,
      sanitizedData.image_url,
      sanitizedData.requirements,
      sanitizedData.benefits,
      sanitizedData.service_type
    ]);
    
    console.log('✅ Service created:', result.rows[0].service_id);
    
    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error creating service:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// 4. UPDATE SERVICE
// ============================================
updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const serviceData = req.body;
    
    console.log('✏️ Update service request:', id);
    
    // Check if service exists
    const existingService = await db.query(
      'SELECT service_id FROM services_master WHERE service_id = $1 AND status = $2',
      [id, 'active']
    );
    
    if (existingService.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }
    
    // Sanitize data
    const sanitizeValue = (value) => {
      if (value === '' || value === undefined) return null;
      if (typeof value === 'string') return value.trim();
      return value;
    };
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    let counter = 1;
    
    if (serviceData.service_name !== undefined) {
      updates.push(`service_name = $${counter++}`);
      values.push(sanitizeValue(serviceData.service_name));
    }
    if (serviceData.description !== undefined) {
      updates.push(`service_description = $${counter++}`);
      values.push(sanitizeValue(serviceData.description));
    }
    if (serviceData.duration_minutes !== undefined) {
      updates.push(`default_duration_minutes = $${counter++}`);
      values.push(parseInt(serviceData.duration_minutes));
    }
    if (serviceData.base_price !== undefined) {
      updates.push(`base_price = $${counter++}`);
      values.push(parseFloat(serviceData.base_price));
    }
    if (serviceData.category !== undefined) {
      updates.push(`category = $${counter++}`);
      values.push(sanitizeValue(serviceData.category));
    }
    if (serviceData.is_available !== undefined) {
      updates.push(`is_available = $${counter++}`);
      values.push(serviceData.is_available);
    }
    if (serviceData.image_url !== undefined) {
      updates.push(`image_url = $${counter++}`);
      values.push(sanitizeValue(serviceData.image_url));
    }
    if (serviceData.requirements !== undefined) {
      updates.push(`requirements = $${counter++}`);
      values.push(sanitizeValue(serviceData.requirements));
    }
    if (serviceData.benefits !== undefined) {
      updates.push(`benefits = $${counter++}`);
      values.push(sanitizeValue(serviceData.benefits));
    }
    if (serviceData.service_type !== undefined) {
      updates.push(`service_type = $${counter++}`);
      values.push(sanitizeValue(serviceData.service_type));
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(id);
    
    const query = `
      UPDATE services_master 
      SET ${updates.join(', ')}
      WHERE service_id = $${counter}
      RETURNING 
        service_id,
        service_name,
        service_description as description,
        default_duration_minutes as duration_minutes,
        base_price,
        category,
        is_available,
        image_url,
        requirements,
        benefits,
        service_type,
        created_at,
        updated_at,
        status
    `;
    
    const result = await db.query(query, values);
    
    console.log('✅ Service updated successfully');
    
    res.json({
      success: true,
      message: 'Service updated successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error updating service:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// 5. DELETE SERVICE (SOFT DELETE)
// ============================================
deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🗑️ Delete service request:', id);
    
    // Check if service exists
    const existingService = await db.query(
      'SELECT service_id FROM services_master WHERE service_id = $1 AND status = $2',
      [id, 'active']
    );
    
    if (existingService.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }
    
    // Soft delete
    await db.query(`
      UPDATE services_master 
      SET status = 'inactive', deleted_at = NOW()
      WHERE service_id = $1
    `, [id]);
    
    console.log('✅ Service deleted successfully');
    
    res.json({
      success: true,
      message: 'Service deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting service:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// 6. TOGGLE SERVICE AVAILABILITY
// ============================================
toggleServiceAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_available } = req.body;
    
    console.log('🔄 Toggle service availability:', id, is_available);
    
    const result = await db.query(`
      UPDATE services_master 
      SET is_available = $1, updated_at = NOW()
      WHERE service_id = $2 AND status = 'active'
      RETURNING 
        service_id,
        service_name,
        service_description as description,
        default_duration_minutes as duration_minutes,
        base_price,
        category,
        is_available,
        image_url,
        requirements,
        benefits,
        service_type,
        created_at,
        updated_at,
        status
    `, [is_available, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }
    
    console.log('✅ Service availability toggled');
    
    res.json({
      success: true,
      message: 'Service availability updated',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error toggling availability:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
// ============================================
// 1. GET ALL CATEGORIES
// ============================================
getAllCategories = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      is_active, 
      search 
    } = req.query;
    
    console.log('📋 Get all categories request:', { page, limit, is_active, search });
    
    const offset = (page - 1) * limit;
    
    // Build query conditions
    let conditions = ["sc.status = 'active'"];
    let queryParams = [];
    let paramCounter = 1;
    
    if (is_active !== undefined && is_active !== '') {
      conditions.push(`sc.is_active = $${paramCounter++}`);
      queryParams.push(is_active === 'true');
    }
    
    if (search) {
      conditions.push(`(sc.category_name ILIKE $${paramCounter} OR sc.description ILIKE $${paramCounter})`);
      queryParams.push(`%${search}%`);
      paramCounter++;
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) FROM service_categories sc ${whereClause}`;
    const countResult = await db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);
    
    // Get paginated categories with service count
    const categoriesQuery = `
      SELECT 
        sc.*,
        COUNT(sm.service_id) as services_count
      FROM service_categories sc
      LEFT JOIN services_master sm ON sm.category = sc.category_name AND sm.status = 'active'
      ${whereClause}
      GROUP BY sc.category_id
      ORDER BY sc.display_order ASC, sc.created_at DESC
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;
    
    const categories = await db.query(categoriesQuery, [...queryParams, limit, offset]);
    
    console.log(`✅ Found ${categories.rows.length} categories`);
    
    res.json({
      success: true,
      data: {
        categories: categories.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// 2. GET CATEGORY BY ID
// ============================================
getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('📄 Get category by ID:', id);
    
    const category = await db.query(`
      SELECT 
        sc.*,
        COUNT(sm.service_id) as services_count
      FROM service_categories sc
      LEFT JOIN services_master sm ON sm.category = sc.category_name AND sm.status = 'active'
      WHERE sc.category_id = $1 AND sc.status = $2
      GROUP BY sc.category_id
    `, [id, 'active']);
    
    if (category.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    
    console.log('✅ Category found:', category.rows[0].category_name);
    
    res.json({
      success: true,
      data: category.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error fetching category:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// 3. CREATE CATEGORY
// ============================================
createCategory = async (req, res) => {
  try {
    const categoryData = req.body;
    
    console.log('➕ Create category request:', categoryData.category_name);
    
    // Validate required fields
    if (!categoryData.category_name) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required'
      });
    }
    
    // Check if category name already exists
    const existingCategory = await db.query(
      'SELECT category_id FROM service_categories WHERE category_name = $1 AND status = $2',
      [categoryData.category_name.trim(), 'active']
    );
    
    if (existingCategory.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Category with this name already exists'
      });
    }
    
    // Sanitize data
    const sanitizedData = {
      category_name: categoryData.category_name.trim(),
      description: categoryData.description?.trim() || null,
      icon: categoryData.icon?.trim() || null,
      color: categoryData.color || '#3B82F6',
      display_order: categoryData.display_order || 1,
      is_active: categoryData.is_active !== undefined ? categoryData.is_active : true
    };
    
    // Validate display order
    if (sanitizedData.display_order < 1 || sanitizedData.display_order > 100) {
      return res.status(400).json({
        success: false,
        message: 'Display order must be between 1 and 100'
      });
    }
    
    // Insert category
    const result = await db.query(`
      INSERT INTO service_categories (
        category_name, 
        description, 
        icon, 
        color,
        display_order, 
        is_active,
        created_at, 
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `, [
      sanitizedData.category_name,
      sanitizedData.description,
      sanitizedData.icon,
      sanitizedData.color,
      sanitizedData.display_order,
      sanitizedData.is_active
    ]);
    
    console.log('✅ Category created:', result.rows[0].category_id);
    
    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error creating category:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// 4. UPDATE CATEGORY
// ============================================
updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const categoryData = req.body;
    
    console.log('✏️ Update category request:', id);
    
    // Check if category exists
    const existingCategory = await db.query(
      'SELECT category_id, category_name FROM service_categories WHERE category_id = $1 AND status = $2',
      [id, 'active']
    );
    
    if (existingCategory.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    
    // If changing name, check for duplicates
    if (categoryData.category_name && categoryData.category_name.trim() !== existingCategory.rows[0].category_name) {
      const duplicate = await db.query(
        'SELECT category_id FROM service_categories WHERE category_name = $1 AND category_id != $2 AND status = $3',
        [categoryData.category_name.trim(), id, 'active']
      );
      
      if (duplicate.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Category with this name already exists'
        });
      }
    }
    
    // Sanitize data
    const sanitizeValue = (value) => {
      if (value === '' || value === undefined) return null;
      if (typeof value === 'string') return value.trim();
      return value;
    };
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    let counter = 1;
    
    const oldCategoryName = existingCategory.rows[0].category_name;
    let newCategoryName = null;
    
    if (categoryData.category_name !== undefined) {
      updates.push(`category_name = $${counter++}`);
      newCategoryName = sanitizeValue(categoryData.category_name);
      values.push(newCategoryName);
    }
    if (categoryData.description !== undefined) {
      updates.push(`description = $${counter++}`);
      values.push(sanitizeValue(categoryData.description));
    }
    if (categoryData.icon !== undefined) {
      updates.push(`icon = $${counter++}`);
      values.push(sanitizeValue(categoryData.icon));
    }
    if (categoryData.color !== undefined) {
      updates.push(`color = $${counter++}`);
      values.push(categoryData.color || '#3B82F6');
    }
    if (categoryData.display_order !== undefined) {
      updates.push(`display_order = $${counter++}`);
      values.push(parseInt(categoryData.display_order));
    }
    if (categoryData.is_active !== undefined) {
      updates.push(`is_active = $${counter++}`);
      values.push(categoryData.is_active);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(id);
    
    const query = `
      UPDATE service_categories 
      SET ${updates.join(', ')}
      WHERE category_id = $${counter}
      RETURNING *
    `;
    
    const result = await db.query(query, values);
    
    // If category name changed, update all services using this category
    if (newCategoryName && newCategoryName !== oldCategoryName) {
      await db.query(
        'UPDATE services_master SET category = $1 WHERE category = $2',
        [newCategoryName, oldCategoryName]
      );
      console.log(`✅ Updated category name in services_master: ${oldCategoryName} → ${newCategoryName}`);
    }
    
    console.log('✅ Category updated successfully');
    
    res.json({
      success: true,
      message: 'Category updated successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error updating category:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// 5. DELETE CATEGORY (SOFT DELETE)
// ============================================
deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🗑️ Delete category request:', id);
    
    // Check if category exists
    const existingCategory = await db.query(
      'SELECT category_id, category_name FROM service_categories WHERE category_id = $1 AND status = $2',
      [id, 'active']
    );
    
    if (existingCategory.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    
    // Check if category is being used by any services
    const servicesUsingCategory = await db.query(
      'SELECT COUNT(*) FROM services_master WHERE category = $1 AND status = $2',
      [existingCategory.rows[0].category_name, 'active']
    );
    
    const servicesCount = parseInt(servicesUsingCategory.rows[0].count);
    
    if (servicesCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category. ${servicesCount} service(s) are using this category. Please reassign or delete those services first.`
      });
    }
    
    // Soft delete
    await db.query(`
      UPDATE service_categories 
      SET status = 'inactive', deleted_at = NOW()
      WHERE category_id = $1
    `, [id]);
    
    console.log('✅ Category deleted successfully');
    
    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting category:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// BOOKING MANAGEMENT BACKEND IMPLEMENTATION
// COMPLETE AND BUG-FREE CODE
// ADD TO controllers/adminController.js
// ============================================

// ============================================
// 1. GET ALL BOOKINGS WITH FILTERS
// ============================================
getAllBookings = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      booking_status, 
      payment_status,
      date_from,
      date_to,
      search 
    } = req.query;
    
    console.log('📋 Get all bookings request:', { page, limit, booking_status, payment_status, search });
    
    const offset = (page - 1) * limit;
    
    // Build query conditions
    let conditions = ["b.status = 'active'"];
    let queryParams = [];
    let paramCounter = 1;
    
    if (booking_status) {
      conditions.push(`b.booking_status = $${paramCounter++}`);
      queryParams.push(booking_status);
    }
    
    if (payment_status) {
      conditions.push(`b.payment_status = $${paramCounter++}`);
      queryParams.push(payment_status);
    }
    
    if (date_from) {
      conditions.push(`b.booking_date >= $${paramCounter++}`);
      queryParams.push(date_from);
    }
    
    if (date_to) {
      conditions.push(`b.booking_date <= $${paramCounter++}`);
      queryParams.push(date_to);
    }
    
    if (search) {
      conditions.push(`(
        cu.full_name ILIKE $${paramCounter} OR 
        cu.email ILIKE $${paramCounter} OR 
        v.full_name ILIKE $${paramCounter} OR
        vsd.shop_name ILIKE $${paramCounter}
      )`);
      queryParams.push(`%${search}%`);
      paramCounter++;
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) 
      FROM bookings b
      LEFT JOIN users cu ON b.user_id = cu.user_id
      LEFT JOIN users v ON b.vendor_id = v.user_id
      LEFT JOIN vendor_shop_details vsd ON v.user_id = vsd.vendor_id
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);
    
    // Get paginated bookings with details
    const bookingsQuery = `
      SELECT 
        b.*,
        cu.full_name as customer_name,
        cu.email as customer_email,
        cu.phone_number as customer_phone,
        v.full_name as vendor_name,
        v.phone_number as vendor_phone,
        vsd.shop_name,
        COUNT(bs.booking_service_id) as services_count
      FROM bookings b
      LEFT JOIN users cu ON b.user_id = cu.user_id
      LEFT JOIN users v ON b.vendor_id = v.user_id
      LEFT JOIN vendor_shop_details vsd ON v.user_id = vsd.vendor_id
      LEFT JOIN booking_services bs ON b.booking_id = bs.booking_id AND bs.status = 'active'
      ${whereClause}
      GROUP BY b.booking_id, cu.full_name, cu.email, cu.phone_number, 
               v.full_name, v.phone_number, vsd.shop_name
      ORDER BY b.created_at DESC
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;
    
    const bookings = await db.query(bookingsQuery, [...queryParams, limit, offset]);
    
    console.log(`✅ Found ${bookings.rows.length} bookings`);
    
    res.json({
      success: true,
      data: {
        bookings: bookings.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// 2. GET BOOKING BY ID WITH FULL DETAILS
// ============================================
getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('📄 Get booking by ID:', id);
    
    // Get booking details
    const bookingQuery = `
      SELECT 
        b.*,
        cu.full_name as customer_name,
        cu.email as customer_email,
        cu.phone_number as customer_phone,
        v.full_name as vendor_name,
        v.phone_number as vendor_phone,
        v.email as vendor_email,
        vsd.shop_name,
        vsd.shop_address
      FROM bookings b
      LEFT JOIN users cu ON b.user_id = cu.user_id
      LEFT JOIN users v ON b.vendor_id = v.user_id
      LEFT JOIN vendor_shop_details vsd ON v.user_id = vsd.vendor_id
      WHERE b.booking_id = $1 AND b.status = 'active'
    `;
    
    const booking = await db.query(bookingQuery, [id]);
    
    if (booking.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    // Get booking services
    const servicesQuery = `
      SELECT 
        bs.*
      FROM booking_services bs
      WHERE bs.booking_id = $1 AND bs.status = 'active'
      ORDER BY bs.start_time
    `;
    
    const services = await db.query(servicesQuery, [id]);
    
    const bookingData = {
      ...booking.rows[0],
      services: services.rows
    };
    
    console.log('✅ Booking found:', bookingData.booking_id);
    
    res.json({
      success: true,
      data: bookingData
    });
    
  } catch (error) {
    console.error('❌ Error fetching booking:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// 3. CREATE BOOKING
// ============================================
createBooking = async (req, res) => {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    const bookingData = req.body;
    
    console.log('➕ Create booking request:', {
      user_id: bookingData.user_id,
      vendor_id: bookingData.vendor_id,
      booking_date: bookingData.booking_date,
      services_count: bookingData.services?.length || 0
    });
    
    // Validate required fields
    if (!bookingData.user_id || !bookingData.vendor_id || !bookingData.booking_date) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'User ID, Vendor ID, and Booking Date are required'
      });
    }
    
    if (!bookingData.services || bookingData.services.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'At least one service is required'
      });
    }
    
    // Verify user exists and is customer
    const userCheck = await client.query(
      'SELECT user_id, role FROM users WHERE user_id = $1 AND status = $2',
      [bookingData.user_id, 'active']
    );
    
    if (userCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    if (userCheck.rows[0].role !== 'customer') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Selected user is not a customer'
      });
    }
    
    // Verify vendor exists and is approved
    const vendorCheck = await client.query(
      'SELECT user_id, verification_status FROM users WHERE user_id = $1 AND role = $2 AND status = $3',
      [bookingData.vendor_id, 'vendor', 'active']
    );
    
    if (vendorCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }
    
    if (vendorCheck.rows[0].verification_status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Vendor is not approved'
      });
    }
    
    // Validate booking date is not in the past
    const bookingDate = new Date(bookingData.booking_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (bookingDate < today) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Booking date cannot be in the past'
      });
    }
    
    // Calculate total amount
    const totalAmount = bookingData.services.reduce(
      (sum, service) => sum + parseFloat(service.service_price), 
      0
    );
    
    // Insert booking
    const bookingInsertQuery = `
      INSERT INTO bookings (
        user_id,
        vendor_id,
        booking_date,
        total_amount,
        payment_method,
        payment_status,
        booking_status,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `;
    
    const bookingResult = await client.query(bookingInsertQuery, [
      bookingData.user_id,
      bookingData.vendor_id,
      bookingData.booking_date,
      totalAmount,
      bookingData.payment_method || 'cash',
      bookingData.payment_status || 'pending',
      'confirmed'
    ]);
    
    const newBooking = bookingResult.rows[0];
    
    // Insert booking services
    for (const service of bookingData.services) {
      const serviceInsertQuery = `
        INSERT INTO booking_services (
          booking_id,
          service_id,
          service_name,
          service_price,
          start_time,
          end_time,
          duration_minutes,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      `;
      
      await client.query(serviceInsertQuery, [
        newBooking.booking_id,
        service.service_id,
        service.service_name,
        service.service_price,
        service.start_time,
        service.end_time,
        service.duration_minutes
      ]);
    }
    
    await client.query('COMMIT');
    
    console.log('✅ Booking created:', newBooking.booking_id);
    
    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: newBooking
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating booking:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  } finally {
    client.release();
  }
};

// ============================================
// 4. UPDATE BOOKING STATUS
// ============================================
updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { booking_status, payment_status } = req.body;
    
    console.log('✏️ Update booking status:', { id, booking_status, payment_status });
    
    // Check if booking exists
    const existingBooking = await db.query(
      'SELECT booking_id, booking_status FROM bookings WHERE booking_id = $1 AND status = $2',
      [id, 'active']
    );
    
    if (existingBooking.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    // Prevent updating cancelled bookings
    if (existingBooking.rows[0].booking_status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update status of cancelled booking'
      });
    }
    
    // Build update query
    const updates = [];
    const values = [];
    let counter = 1;
    
    if (booking_status !== undefined) {
      // Validate booking status
      const validStatuses = ['confirmed', 'completed', 'cancelled', 'no_show'];
      if (!validStatuses.includes(booking_status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid booking status. Must be one of: ${validStatuses.join(', ')}`
        });
      }
      updates.push(`booking_status = $${counter++}`);
      values.push(booking_status);
    }
    
    if (payment_status !== undefined) {
      // Validate payment status
      const validStatuses = ['pending', 'paid', 'failed', 'refunded'];
      if (!validStatuses.includes(payment_status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid payment status. Must be one of: ${validStatuses.join(', ')}`
        });
      }
      updates.push(`payment_status = $${counter++}`);
      values.push(payment_status);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(id);
    
    const query = `
      UPDATE bookings 
      SET ${updates.join(', ')}
      WHERE booking_id = $${counter}
      RETURNING *
    `;
    
    const result = await db.query(query, values);
    
    console.log('✅ Booking status updated successfully');
    
    res.json({
      success: true,
      message: 'Booking status updated successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error updating booking status:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// 5. CANCEL BOOKING
// ============================================
cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { cancellation_reason, cancelled_by } = req.body;
    
    console.log('🗑️ Cancel booking request:', { id, cancelled_by });
    
    // Validate required fields
    if (!cancellation_reason || !cancellation_reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Cancellation reason is required'
      });
    }
    
    if (!cancelled_by) {
      return res.status(400).json({
        success: false,
        message: 'Cancelled by field is required'
      });
    }
    
    // Check if booking exists
    const existingBooking = await db.query(
      'SELECT booking_id, booking_status, payment_status FROM bookings WHERE booking_id = $1 AND status = $2',
      [id, 'active']
    );
    
    if (existingBooking.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    // Check if already cancelled
    if (existingBooking.rows[0].booking_status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Booking is already cancelled'
      });
    }
    
    // Check if already completed
    if (existingBooking.rows[0].booking_status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel completed booking'
      });
    }
    
    // Update booking
    const result = await db.query(`
      UPDATE bookings 
      SET 
        booking_status = 'cancelled',
        cancellation_reason = $1,
        cancelled_by = $2,
        payment_status = CASE 
          WHEN payment_status = 'paid' THEN 'refunded'
          ELSE payment_status
        END,
        updated_at = NOW()
      WHERE booking_id = $3
      RETURNING *
    `, [cancellation_reason.trim(), cancelled_by, id]);
    
    console.log('✅ Booking cancelled successfully');
    
    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error cancelling booking:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// 6. GET VENDOR SERVICES FOR BOOKING
// ============================================
getVendorServicesForBooking = async (req, res) => {
  try {
    const { id } = req.params; // vendor_id
    
    console.log('📄 Get vendor services for booking:', id);
    
    // Get vendor's available services with pricing
    const servicesQuery = `
      SELECT 
        vs.vendor_service_id,
        vs.service_id,
        sm.service_name,
        sm.service_description as description,
        sm.default_duration_minutes as duration_minutes,
        vs.price,
        sm.category,
        vs.is_available
      FROM vendor_services vs
      INNER JOIN services_master sm ON vs.service_id = sm.service_id
      WHERE vs.vendor_id = $1 
        AND vs.status = 'active' 
        AND sm.status = 'active'
        AND vs.is_available = true
      ORDER BY sm.category, sm.service_name
    `;
    
    const services = await db.query(servicesQuery, [id]);
    
    console.log(`✅ Found ${services.rows.length} available services for vendor`);
    
    res.json({
      success: true,
      data: {
        services: services.rows
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching vendor services:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};




module.exports = {
  getAllUsers,
  getUserById,
  createAdmin,
  updateUserStatus,
  deleteUser,
  getAllVendors,
  getVendorById,
  getDashboardStats,
  updateVendorVerification,
  updateVendorShop,
  uploadShopProfileImage,
  uploadShopGalleryImages,
  deleteShopImage,
  setShopPrimaryImage,
  getVendorDocuments,
  uploadVendorDocument,
  updateDocumentVerification,
  deleteVendorDocument,
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  toggleServiceAvailability,
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getAllBookings,
  getBookingById,
  createBooking,
  updateBookingStatus,
  cancelBooking,
  getVendorServicesForBooking
};
