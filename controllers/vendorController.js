const db = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ============================================
// VENDOR SERVICE MANAGEMENT
// ============================================

// Get all services from master
const getAllServicesMaster = async (req, res) => {
  try {
    const result = await db.query(
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
        status
      FROM services_master 
      WHERE status = 'active'
      ORDER BY category, service_name`
    );

    res.json({
      success: true,
      data: {
        services: result.rows,
        total: result.rows.length
      }
    });

  } catch (error) {
    console.error('Get all services error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching services.',
      error: error.message
    });
  }
};

// Get vendor's services
const getVendorServices = async (req, res) => {
  try {
    const vendorId = req.user.userId;

    const result = await db.query(
      `SELECT 
        vs.vendor_service_id as service_id,
        vs.vendor_id,
        sm.service_name,
        sm.service_description as description,
        vs.price,
        sm.default_duration_minutes as duration,
        sm.category,
        vs.is_available,
        sm.image_url,
        vs.created_at
      FROM vendor_services vs
      INNER JOIN services_master sm ON vs.service_id = sm.service_id
      WHERE vs.vendor_id = $1 
        AND vs.status = 'active' 
        AND sm.status = 'active'
      ORDER BY sm.category, sm.service_name`,
      [vendorId]
    );

    res.json({
      success: true,
      data: {
        services: result.rows,
        total: result.rows.length
      }
    });

  } catch (error) {
    console.error('Get vendor services error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching vendor services.',
      error: error.message
    });
  }
};

// Add service to vendor
const addVendorService = async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { service_id, price, is_available } = req.body;

    // Validation
    if (!service_id || !price) {
      return res.status(400).json({
        success: false,
        message: 'Service ID and price are required.'
      });
    }

    // Check if service exists in master
    const serviceCheck = await db.query(
      'SELECT service_id FROM services_master WHERE service_id = $1 AND status = $2',
      [service_id, 'active']
    );

    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found in master list.'
      });
    }

    // Check if vendor already has this service
    const existingService = await db.query(
      'SELECT vendor_service_id FROM vendor_services WHERE vendor_id = $1 AND service_id = $2 AND status = $3',
      [vendorId, service_id, 'active']
    );

    if (existingService.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'This service is already added to your shop.'
      });
    }

    // Add service
    const result = await db.query(
      `INSERT INTO vendor_services (
        vendor_id, 
        service_id, 
        price, 
        is_available, 
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, 'active', NOW())
      RETURNING vendor_service_id`,
      [vendorId, service_id, price, is_available !== false]
    );

    res.status(201).json({
      success: true,
      message: 'Service added successfully.',
      data: {
        vendor_service_id: result.rows[0].vendor_service_id
      }
    });

  } catch (error) {
    console.error('Add vendor service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding service.',
      error: error.message
    });
  }
};

// Add multiple services at once
const addMultipleVendorServices = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const vendorId = req.user.userId;
    const { services } = req.body;

    if (!services || !Array.isArray(services) || services.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Services array is required.'
      });
    }

    await client.query('BEGIN');

    const addedServices = [];
    const errors = [];

    for (const service of services) {
      try {
        const { service_id, price, is_available } = service;

        // Check if already exists
        const existing = await client.query(
          'SELECT vendor_service_id FROM vendor_services WHERE vendor_id = $1 AND service_id = $2 AND status = $3',
          [vendorId, service_id, 'active']
        );

        if (existing.rows.length === 0) {
          const result = await client.query(
            `INSERT INTO vendor_services (
              vendor_id, service_id, price, is_available, status, created_at
            ) VALUES ($1, $2, $3, $4, 'active', NOW())
            RETURNING vendor_service_id`,
            [vendorId, service_id, price, is_available !== false]
          );

          addedServices.push({
            service_id,
            vendor_service_id: result.rows[0].vendor_service_id
          });
        } else {
          errors.push({
            service_id,
            message: 'Service already exists'
          });
        }
      } catch (err) {
        errors.push({
          service_id: service.service_id,
          message: err.message
        });
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `${addedServices.length} service(s) added successfully.`,
      data: {
        added: addedServices,
        errors: errors
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add multiple services error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding services.',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Update vendor service
const updateVendorService = async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { service_id } = req.params;
    const { price, is_available } = req.body;

    // Check ownership
    const serviceCheck = await db.query(
      'SELECT vendor_service_id FROM vendor_services WHERE vendor_service_id = $1 AND vendor_id = $2 AND status = $3',
      [service_id, vendorId, 'active']
    );

    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found or does not belong to you.'
      });
    }

    // Build update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (price !== undefined) {
      updates.push(`price = $${paramCount++}`);
      values.push(price);
    }

    if (is_available !== undefined) {
      updates.push(`is_available = $${paramCount++}`);
      values.push(is_available);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update.'
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(service_id);

    const query = `
      UPDATE vendor_services 
      SET ${updates.join(', ')}
      WHERE vendor_service_id = $${paramCount}
    `;

    await db.query(query, values);

    res.json({
      success: true,
      message: 'Service updated successfully.'
    });

  } catch (error) {
    console.error('Update vendor service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating service.',
      error: error.message
    });
  }
};

// Toggle service availability
const toggleServiceAvailability = async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { service_id } = req.params;
    const { is_available } = req.body;

    const result = await db.query(
      `UPDATE vendor_services 
       SET is_available = $1, updated_at = NOW()
       WHERE vendor_service_id = $2 AND vendor_id = $3 AND status = 'active'
       RETURNING is_available`,
      [is_available, service_id, vendorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found.'
      });
    }

    res.json({
      success: true,
      message: `Service ${is_available ? 'enabled' : 'disabled'} successfully.`,
      data: {
        is_available: result.rows[0].is_available
      }
    });

  } catch (error) {
    console.error('Toggle availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating service availability.',
      error: error.message
    });
  }
};

// Delete vendor service (soft delete)
const deleteVendorService = async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { service_id } = req.params;

    const result = await db.query(
      `UPDATE vendor_services 
       SET status = 'inactive', deleted_at = NOW()
       WHERE vendor_service_id = $1 AND vendor_id = $2 AND status = 'active'`,
      [service_id, vendorId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found.'
      });
    }

    res.json({
      success: true,
      message: 'Service removed successfully.'
    });

  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing service.',
      error: error.message
    });
  }
};

// ============================================
// VENDOR DASHBOARD
// ============================================

const getDashboardStats = async (req, res) => {
  try {
    const vendorId = req.user.userId;

    // Get basic stats
    const stats = await db.query(
      `SELECT 
        vm.total_bookings,
        vm.completed_bookings,
        vm.cancelled_bookings,
        vm.average_rating,
        vm.total_reviews,
        vm.total_revenue
      FROM vendor_metrics vm
      WHERE vm.vendor_id = $1`,
      [vendorId]
    );

    // Get today's bookings count
    const todayBookings = await db.query(
      `SELECT COUNT(*) as count
       FROM bookings
       WHERE vendor_id = $1 
         AND DATE(booking_date) = CURRENT_DATE
         AND status = 'active'`,
      [vendorId]
    );

    // Get confirmed bookings for today
    const confirmedToday = await db.query(
      `SELECT COUNT(*) as count
       FROM bookings
       WHERE vendor_id = $1 
         AND DATE(booking_date) = CURRENT_DATE
         AND booking_status = 'confirmed'
         AND status = 'active'`,
      [vendorId]
    );

    // Get this month's revenue
    const monthlyRevenue = await db.query(
      `SELECT COALESCE(SUM(total_amount), 0) as revenue
       FROM bookings
       WHERE vendor_id = $1
         AND booking_status = 'completed'
         AND EXTRACT(MONTH FROM booking_date) = EXTRACT(MONTH FROM CURRENT_DATE)
         AND EXTRACT(YEAR FROM booking_date) = EXTRACT(YEAR FROM CURRENT_DATE)
         AND status = 'active'`,
      [vendorId]
    );

    // Get total services count
    const servicesCount = await db.query(
      `SELECT COUNT(*) as count
       FROM vendor_services
       WHERE vendor_id = $1 AND status = 'active'`,
      [vendorId]
    );

    // Get recent bookings
    const recentBookings = await db.query(
      `SELECT 
        b.booking_id,
        b.booking_date,
        b.booking_time,
        b.total_amount,
        b.booking_status,
        COALESCE(up.full_name, b.offline_customer_name) as customer_name,
        COALESCE(u.phone_number, b.offline_customer_phone) as customer_phone
      FROM bookings b
      LEFT JOIN users u ON b.user_id = u.user_id
      LEFT JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
      WHERE b.vendor_id = $1 AND b.status = 'active'
      ORDER BY b.created_at DESC
      LIMIT 10`,
      [vendorId]
    );

    const statsData = stats.rows[0] || {
      total_bookings: 0,
      completed_bookings: 0,
      cancelled_bookings: 0,
      average_rating: 0,
      total_reviews: 0,
      total_revenue: 0
    };

    res.json({
      success: true,
      data: {
        total_bookings: statsData.total_bookings || 0,
        todays_bookings: parseInt(todayBookings.rows[0].count),
        confirmed_bookings: parseInt(confirmedToday.rows[0].count),
        completed_bookings: statsData.completed_bookings || 0,
        monthly_revenue: parseFloat(monthlyRevenue.rows[0].revenue),
        average_rating: parseFloat(statsData.average_rating) || 0,
        total_reviews: statsData.total_reviews || 0,
        total_services: parseInt(servicesCount.rows[0].count),
        popular_services: recentBookings.rows
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

// ============================================
// IMAGE UPLOAD CONFIGURATION
// ============================================

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/shops';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'shop-' + uniqueSuffix + ext);
  }
});

const fileFilter = function (req, file, cb) {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only images (JPEG, PNG, WEBP) are allowed!'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilter
});

// Upload shop images
const uploadShopImages = [
  upload.array('images', 10),
  async (req, res) => {
    const client = await db.pool.connect();
    
    try {
      const vendorId = req.user.userId;
      const { image_type } = req.body; // 'shop' or 'portfolio'

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No images provided.'
        });
      }

      await client.query('BEGIN');

      const uploadedImages = [];

      for (const file of req.files) {
        const imageUrl = `/uploads/shops/${file.filename}`;
        
        const result = await client.query(
          `INSERT INTO vendor_images (
            vendor_id, image_url, image_type, status, uploaded_at
          ) VALUES ($1, $2, $3, 'active', NOW())
          RETURNING image_id, image_url`,
          [vendorId, imageUrl, image_type || 'shop']
        );

        uploadedImages.push(result.rows[0]);
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `${uploadedImages.length} image(s) uploaded successfully.`,
        data: uploadedImages
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Upload images error:', error);
      res.status(500).json({
        success: false,
        message: 'Error uploading images.',
        error: error.message
      });
    } finally {
      client.release();
    }
  }
];

// Get vendor images
const getVendorImages = async (req, res) => {
  try {
    const vendorId = req.user.userId;

    const result = await db.query(
      `SELECT image_id, image_url, image_type, uploaded_at
       FROM vendor_images
       WHERE vendor_id = $1 AND status = 'active'
       ORDER BY uploaded_at DESC`,
      [vendorId]
    );

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Get images error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching images.',
      error: error.message
    });
  }
};

// Delete vendor image
const deleteVendorImage = async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { image_id } = req.params;

    // Get image details
    const image = await db.query(
      'SELECT image_url FROM vendor_images WHERE image_id = $1 AND vendor_id = $2 AND status = $3',
      [image_id, vendorId, 'active']
    );

    if (image.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Image not found.'
      });
    }

    // Soft delete
    await db.query(
      `UPDATE vendor_images 
       SET status = 'inactive', deleted_at = NOW()
       WHERE image_id = $1`,
      [image_id]
    );

    // Optional: Delete physical file
    const filePath = path.join(__dirname, '..', image.rows[0].image_url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({
      success: true,
      message: 'Image deleted successfully.'
    });

  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting image.',
      error: error.message
    });
  }
};

module.exports = {
  getAllServicesMaster,
  getVendorServices,
  addVendorService,
  addMultipleVendorServices,
  updateVendorService,
  toggleServiceAvailability,
  deleteVendorService,
  getDashboardStats,
  uploadShopImages,
  getVendorImages,
  deleteVendorImage
};