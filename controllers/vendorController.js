const db = require('../config/database');
const admin = require('../config/firebase');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ============================================
// MULTER CONFIGURATION
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

// ============================================
// VENDOR ONBOARDING - STEP 1: PROFILE
// ============================================

const completeProfileStep = async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { full_name, email, city, state, gender } = req.body;

    // Validation
    if (!full_name) {
      return res.status(400).json({
        success: false,
        message: 'Full name is required.'
      });
    }

    // Update email in users table
    if (email) {
      await db.query(
        'UPDATE users SET email = $1, updated_at = NOW() WHERE user_id = $2',
        [email, vendorId]
      );
    }

    // Mark current profile as not current
    await db.query(
      'UPDATE user_profiles SET is_current = false WHERE user_id = $1 AND is_current = true',
      [vendorId]
    );

    // Insert new profile version
    await db.query(
      `INSERT INTO user_profiles (
        user_id, full_name, city, state, gender, is_current, created_at
      ) VALUES ($1, $2, $3, $4, $5, true, NOW())`,
      [vendorId, full_name, city, state, gender]
    );

    // Update onboarding step
    await db.query(
      'UPDATE users SET onboarding_step = 1, updated_at = NOW() WHERE user_id = $1',
      [vendorId]
    );

    res.json({
      success: true,
      message: 'Profile completed successfully.',
      data: {
        onboarding_step: 1
      }
    });

  } catch (error) {
    console.error('Complete profile step error:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing profile step.',
      error: error.message
    });
  }
};

// ============================================
// VENDOR ONBOARDING - STEP 2: SHOP DETAILS
// ============================================

const completeShopDetailsStep = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const vendorId = req.user.userId;
    const {
      shop_name,
      shop_address,
      city,
      state,
      latitude,
      longitude,
      open_time,
      close_time,
      break_start_time,
      break_end_time,
      weekly_holiday,
      no_of_seats,
      no_of_workers
    } = req.body;

    // Validation
    if (!shop_name || !shop_address || !city || !open_time || !close_time) {
      return res.status(400).json({
        success: false,
        message: 'Shop name, address, city, open time, and close time are required.'
      });
    }

    await client.query('BEGIN');

    // Check if shop details already exist
    const existingShop = await client.query(
      'SELECT shop_id FROM vendor_shop_details WHERE vendor_id = $1',
      [vendorId]
    );

    if (existingShop.rows.length > 0) {
      // Update existing shop
      await client.query(
        `UPDATE vendor_shop_details SET
          shop_name = $1,
          shop_address = $2,
          city = $3,
          state = $4,
          latitude = $5,
          longitude = $6,
          open_time = $7,
          close_time = $8,
          break_start_time = $9,
          break_end_time = $10,
          weekly_holiday = $11,
          no_of_seats = $12,
          no_of_workers = $13,
          updated_at = NOW()
        WHERE vendor_id = $14`,
        [
          shop_name, shop_address, city, state || 'Maharashtra',
          latitude, longitude, open_time, close_time,
          break_start_time, break_end_time, weekly_holiday,
          no_of_seats || 1, no_of_workers || 1, vendorId
        ]
      );
    } else {
      // Create new shop
      await client.query(
        `INSERT INTO vendor_shop_details (
          vendor_id, shop_name, shop_address, city, state,
          latitude, longitude, open_time, close_time,
          break_start_time, break_end_time, weekly_holiday,
          no_of_seats, no_of_workers, verification_status,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 0, NOW(), NOW())`,
        [
          vendorId, shop_name, shop_address, city, state || 'Maharashtra',
          latitude, longitude, open_time, close_time,
          break_start_time, break_end_time, weekly_holiday,
          no_of_seats || 1, no_of_workers || 1
        ]
      );

      // Initialize vendor metrics
      const metricsExists = await client.query(
        'SELECT vendor_id FROM vendor_metrics WHERE vendor_id = $1',
        [vendorId]
      );

      if (metricsExists.rows.length === 0) {
        await client.query(
          'INSERT INTO vendor_metrics (vendor_id, created_at) VALUES ($1, NOW())',
          [vendorId]
        );
      }
    }

    // Update onboarding step
    await client.query(
      'UPDATE users SET onboarding_step = 2, updated_at = NOW() WHERE user_id = $1',
      [vendorId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Shop details completed successfully.',
      data: {
        onboarding_step: 2
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Complete shop details step error:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing shop details step.',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// ============================================
// VENDOR ONBOARDING - STEP 3: SERVICES
// ============================================

// Get all service categories
const getAllServiceCategories = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        category_id,
        category_name,
        description,
        icon,
        color,
        display_order,
        (SELECT COUNT(*) FROM services_master 
         WHERE category = sc.category_name AND status = 'active') as services_count
      FROM service_categories sc
      WHERE status = 'active' AND is_active = true
      ORDER BY display_order ASC, category_name ASC`
    );

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Get service categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching service categories.',
      error: error.message
    });
  }
};

// Get services by category
const getServicesByCategory = async (req, res) => {
  try {
    const { category } = req.params;

    const result = await db.query(
      `SELECT 
        service_id,
        service_name,
        service_description as description,
        default_duration_minutes as duration_minutes,
        base_price,
        category,
        image_url
      FROM services_master
      WHERE category = $1 AND status = 'active' AND is_available = true
      ORDER BY service_name ASC`,
      [category]
    );

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Get services by category error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching services.',
      error: error.message
    });
  }
};

// Add services to vendor (bulk)
const addVendorServices = async (req, res) => {
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

    for (const service of services) {
      const { service_id, price } = service;

      // Check if already exists
      const existing = await client.query(
        'SELECT vendor_service_id FROM vendor_services WHERE vendor_id = $1 AND service_id = $2 AND status = $3',
        [vendorId, service_id, 'active']
      );

      if (existing.rows.length === 0) {
        const result = await client.query(
          `INSERT INTO vendor_services (
            vendor_id, service_id, price, is_available, status, created_at
          ) VALUES ($1, $2, $3, true, 'active', NOW())
          RETURNING vendor_service_id`,
          [vendorId, service_id, price]
        );

        addedServices.push({
          service_id,
          vendor_service_id: result.rows[0].vendor_service_id,
          price
        });
      }
    }

    // Update onboarding step and verification status
    await client.query(
      `UPDATE users 
       SET onboarding_step = 3, 
           onboarding_completed = true,
           updated_at = NOW() 
       WHERE user_id = $1`,
      [vendorId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `${addedServices.length} service(s) added successfully. Onboarding completed!`,
      data: {
        added_services: addedServices,
        onboarding_step: 3,
        onboarding_completed: true
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add vendor services error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding services.',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Add custom service
const addCustomService = async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { service_name, description, price, duration_minutes, category } = req.body;

    // Validation
    if (!service_name || !price) {
      return res.status(400).json({
        success: false,
        message: 'Service name and price are required.'
      });
    }

    // Create custom service in services_master
    const serviceResult = await db.query(
      `INSERT INTO services_master (
        service_name,
        service_description,
        default_duration_minutes,
        base_price,
        category,
        is_available,
        service_type,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, true, 'custom', 'active', NOW())
      RETURNING service_id`,
      [service_name, description, duration_minutes || 30, price, category || 'Other']
    );

    const serviceId = serviceResult.rows[0].service_id;

    // Add to vendor services
    const vendorServiceResult = await db.query(
      `INSERT INTO vendor_services (
        vendor_id, service_id, price, is_available, status, created_at
      ) VALUES ($1, $2, $3, true, 'active', NOW())
      RETURNING vendor_service_id`,
      [vendorId, serviceId, price]
    );

    res.status(201).json({
      success: true,
      message: 'Custom service added successfully.',
      data: {
        service_id: serviceId,
        vendor_service_id: vendorServiceResult.rows[0].vendor_service_id
      }
    });

  } catch (error) {
    console.error('Add custom service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding custom service.',
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

    // Get today's bookings
    const todayBookings = await db.query(
      `SELECT 
        b.booking_id,
        b.booking_time,
        b.total_price,
        b.booking_status,
        COALESCE(up.full_name, b.offline_customer_name) as customer_name,
        COALESCE(u.phone_number, b.offline_customer_phone) as customer_phone,
        (SELECT COUNT(*) FROM booking_services WHERE booking_id = b.booking_id AND status = 'active') as services_count
      FROM bookings b
      LEFT JOIN users u ON b.customer_id = u.user_id
      LEFT JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
      WHERE b.vendor_id = $1 
        AND DATE(b.booking_date) = CURRENT_DATE
        AND b.status = 'active'
      ORDER BY b.booking_time ASC`,
      [vendorId]
    );

    // Get this week's revenue
    const weeklyRevenue = await db.query(
      `SELECT COALESCE(SUM(total_price), 0) as revenue
       FROM bookings
       WHERE vendor_id = $1
         AND booking_status = 'completed'
         AND booking_date >= CURRENT_DATE - INTERVAL '7 days'
         AND status = 'active'`,
      [vendorId]
    );

    // Get this month's bookings count
    const monthlyBookings = await db.query(
      `SELECT COUNT(*) as count
       FROM bookings
       WHERE vendor_id = $1
         AND EXTRACT(MONTH FROM booking_date) = EXTRACT(MONTH FROM CURRENT_DATE)
         AND EXTRACT(YEAR FROM booking_date) = EXTRACT(YEAR FROM CURRENT_DATE)
         AND status = 'active'`,
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
        completed_bookings: statsData.completed_bookings || 0,
        cancelled_bookings: statsData.cancelled_bookings || 0,
        average_rating: parseFloat(statsData.average_rating) || 0,
        total_reviews: statsData.total_reviews || 0,
        total_revenue: parseFloat(statsData.total_revenue) || 0,
        weekly_revenue: parseFloat(weeklyRevenue.rows[0].revenue),
        monthly_bookings: parseInt(monthlyBookings.rows[0].count),
        todays_bookings: todayBookings.rows
      }
    });

  } catch (error) {
    console.error('Get vendor dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics.',
      error: error.message
    });
  }
};

// ============================================
// BOOKING MANAGEMENT
// ============================================

// Get all bookings
const getAllBookings = async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { status, date_from, date_to, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        b.booking_id,
        b.booking_date,
        b.booking_time,
        b.total_price,
        b.booking_status,
        b.payment_status,
        b.customer_notes,
        b.offline_customer_name,
        b.offline_customer_phone,
        b.created_at,
        COALESCE(up.full_name, b.offline_customer_name) as customer_name,
        COALESCE(u.phone_number, b.offline_customer_phone) as customer_phone,
        (SELECT COUNT(*) FROM booking_services 
         WHERE booking_id = b.booking_id AND status = 'active') as services_count
      FROM bookings b
      LEFT JOIN users u ON b.customer_id = u.user_id
      LEFT JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
      WHERE b.vendor_id = $1 AND b.status = 'active'
    `;
    
    const params = [vendorId];
    let paramCount = 2;

    if (status) {
      query += ` AND b.booking_status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (date_from) {
      query += ` AND b.booking_date >= $${paramCount}`;
      params.push(date_from);
      paramCount++;
    }

    if (date_to) {
      query += ` AND b.booking_date <= $${paramCount}`;
      params.push(date_to);
      paramCount++;
    }

    // Count total
    const countQuery = `SELECT COUNT(*) FROM (${query}) as total_count`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    query += ` ORDER BY b.booking_date DESC, b.booking_time DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: {
        bookings: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get all bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bookings.',
      error: error.message
    });
  }
};

// Get booking details
const getBookingDetails = async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { bookingId } = req.params;

    const booking = await db.query(
      `SELECT 
        b.*,
        COALESCE(up.full_name, b.offline_customer_name) as customer_name,
        COALESCE(u.phone_number, b.offline_customer_phone) as customer_phone,
        COALESCE(u.email, '') as customer_email
      FROM bookings b
      LEFT JOIN users u ON b.customer_id = u.user_id
      LEFT JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
      WHERE b.booking_id = $1 AND b.vendor_id = $2 AND b.status = 'active'`,
      [bookingId, vendorId]
    );

    if (booking.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found.'
      });
    }

    // Get booking services
    const services = await db.query(
      `SELECT * FROM booking_services 
       WHERE booking_id = $1 AND status = 'active'
       ORDER BY created_at`,
      [bookingId]
    );

    res.json({
      success: true,
      data: {
        ...booking.rows[0],
        services: services.rows
      }
    });

  } catch (error) {
    console.error('Get booking details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching booking details.',
      error: error.message
    });
  }
};

// Create offline booking
const createOfflineBooking = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const vendorId = req.user.userId;
    const {
      customer_name,
      customer_phone,
      booking_date,
      booking_time,
      services,
      payment_method,
      notes
    } = req.body;

    // Validation
    if (!customer_name || !customer_phone || !booking_date || !booking_time || !services || services.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Customer name, phone, date, time, and services are required.'
      });
    }

    await client.query('BEGIN');

    // Check slot availability
    const shopDetails = await client.query(
      'SELECT no_of_seats FROM vendor_shop_details WHERE vendor_id = $1',
      [vendorId]
    );

    const existingBookings = await client.query(
      `SELECT COUNT(*) as count FROM bookings 
       WHERE vendor_id = $1 AND booking_date = $2 AND booking_time = $3 
         AND booking_status IN ('confirmed', 'completed') AND status = 'active'`,
      [vendorId, booking_date, booking_time]
    );

    const bookedSeats = parseInt(existingBookings.rows[0].count);
    const totalSeats = shopDetails.rows[0].no_of_seats;

    if (bookedSeats >= totalSeats) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Selected time slot is not available.'
      });
    }

    // Calculate total price
    let totalPrice = 0;
    let totalDuration = 0;

    for (const service of services) {
      const serviceData = await client.query(
        `SELECT vs.price, sm.default_duration_minutes 
         FROM vendor_services vs
         INNER JOIN services_master sm ON vs.service_id = sm.service_id
         WHERE vs.vendor_service_id = $1 AND vs.vendor_id = $2`,
        [service.vendor_service_id, vendorId]
      );

      if (serviceData.rows.length > 0) {
        totalPrice += parseFloat(serviceData.rows[0].price);
        totalDuration += parseInt(serviceData.rows[0].default_duration_minutes);
      }
    }

    // Create booking
    const bookingResult = await client.query(
      `INSERT INTO bookings (
        vendor_id,
        offline_customer_name,
        offline_customer_phone,
        booking_date,
        booking_time,
        total_price,
        total_duration_minutes,
        booking_status,
        payment_method,
        payment_status,
        vendor_notes,
        is_offline_booking,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', $8, $9, $10, true, NOW(), NOW())
      RETURNING booking_id, booking_date, booking_time, total_price`,
      [
        vendorId,
        customer_name,
        customer_phone,
        booking_date,
        booking_time,
        totalPrice,
        totalDuration,
        payment_method || 'cash',
        payment_method === 'cash' ? 'pending' : 'paid',
        notes
      ]
    );

    const booking = bookingResult.rows[0];

    // Add booking services
    for (const service of services) {
      const serviceData = await client.query(
        `SELECT vs.price, sm.service_name, sm.default_duration_minutes
         FROM vendor_services vs
         INNER JOIN services_master sm ON vs.service_id = sm.service_id
         WHERE vs.vendor_service_id = $1`,
        [service.vendor_service_id]
      );

      if (serviceData.rows.length > 0) {
        await client.query(
          `INSERT INTO booking_services (
            booking_id,
            service_id,
            service_name,
            service_price,
            duration_minutes,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())`,
          [
            booking.booking_id,
            service.vendor_service_id,
            serviceData.rows[0].service_name,
            serviceData.rows[0].price,
            serviceData.rows[0].default_duration_minutes
          ]
        );
      }
    }

    // Update vendor metrics
    await client.query(
      `UPDATE vendor_metrics 
       SET total_bookings = COALESCE(total_bookings, 0) + 1,
           updated_at = NOW()
       WHERE vendor_id = $1`,
      [vendorId]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Offline booking created successfully.',
      data: booking
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create offline booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating offline booking.',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Update booking status
const updateBookingStatus = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const vendorId = req.user.userId;
    const { bookingId } = req.params;
    const { booking_status, payment_status, vendor_notes } = req.body;

    await client.query('BEGIN');

    // Check if booking exists
    const booking = await client.query(
      `SELECT booking_id, booking_status, customer_id, total_price 
       FROM bookings 
       WHERE booking_id = $1 AND vendor_id = $2 AND status = 'active'`,
      [bookingId, vendorId]
    );

    if (booking.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Booking not found.'
      });
    }

    const oldStatus = booking.rows[0].booking_status;

    // Update booking
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (booking_status) {
      updates.push(`booking_status = $${paramCount++}`);
      values.push(booking_status);
    }

    if (payment_status) {
      updates.push(`payment_status = $${paramCount++}`);
      values.push(payment_status);
    }

    if (vendor_notes !== undefined) {
      updates.push(`vendor_notes = $${paramCount++}`);
      values.push(vendor_notes);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(bookingId, vendorId);

      const query = `
        UPDATE bookings 
        SET ${updates.join(', ')}
        WHERE booking_id = $${paramCount} AND vendor_id = $${paramCount + 1}
      `;

      await client.query(query, values);
    }

    // Update vendor metrics if booking completed
    if (booking_status === 'completed' && oldStatus !== 'completed') {
      await client.query(
        `UPDATE vendor_metrics 
         SET completed_bookings = COALESCE(completed_bookings, 0) + 1,
             total_revenue = COALESCE(total_revenue, 0) + $1,
             updated_at = NOW()
         WHERE vendor_id = $2`,
        [booking.rows[0].total_price, vendorId]
      );
    }

    // Update vendor metrics if booking cancelled
    if (booking_status === 'cancelled' && oldStatus !== 'cancelled') {
      await client.query(
        `UPDATE vendor_metrics 
         SET cancelled_bookings = COALESCE(cancelled_bookings, 0) + 1,
             updated_at = NOW()
         WHERE vendor_id = $1`,
        [vendorId]
      );
    }

    await client.query('COMMIT');

    // Send notification to customer if exists
    if (booking.rows[0].customer_id) {
      try {
        const customerFCM = await client.query(
          'SELECT fcm_token FROM user_profiles WHERE user_id = $1 AND is_current = true',
          [booking.rows[0].customer_id]
        );

        if (customerFCM.rows[0]?.fcm_token) {
          let notificationTitle = '';
          let notificationBody = '';

          if (booking_status === 'completed') {
            notificationTitle = 'Booking Completed';
            notificationBody = 'Your booking has been completed successfully!';
          } else if (booking_status === 'cancelled') {
            notificationTitle = 'Booking Cancelled';
            notificationBody = 'Your booking has been cancelled by the vendor.';
          }

          if (notificationTitle) {
            await admin.messaging().send({
              token: customerFCM.rows[0].fcm_token,
              notification: {
                title: notificationTitle,
                body: notificationBody
              },
              data: {
                type: 'booking_status_update',
                booking_id: bookingId.toString(),
                status: booking_status
              }
            });
          }
        }
      } catch (notifError) {
        console.error('Notification error:', notifError);
      }
    }

    res.json({
      success: true,
      message: 'Booking status updated successfully.'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update booking status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating booking status.',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// ============================================
// SERVICE MANAGEMENT
// ============================================

// Get vendor's services
const getMyServices = async (req, res) => {
  try {
    const vendorId = req.user.userId;

    const result = await db.query(
      `SELECT 
        vs.vendor_service_id,
        vs.service_id,
        sm.service_name,
        sm.service_description as description,
        vs.price,
        sm.default_duration_minutes as duration_minutes,
        sm.category,
        vs.is_available,
        sm.image_url,
        sm.service_type
      FROM vendor_services vs
      INNER JOIN services_master sm ON vs.service_id = sm.service_id
      WHERE vs.vendor_id = $1 AND vs.status = 'active'
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
      message: 'Error fetching services.',
      error: error.message
    });
  }
};

// Update service
const updateService = async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { serviceId } = req.params;
    const { price, is_available } = req.body;

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
    values.push(serviceId, vendorId);

    const query = `
      UPDATE vendor_services 
      SET ${updates.join(', ')}
      WHERE vendor_service_id = $${paramCount} AND vendor_id = $${paramCount + 1} AND status = 'active'
    `;

    const result = await db.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found.'
      });
    }

    res.json({
      success: true,
      message: 'Service updated successfully.'
    });

  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating service.',
      error: error.message
    });
  }
};

// Delete service
const deleteService = async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { serviceId } = req.params;

    const result = await db.query(
      `UPDATE vendor_services 
       SET status = 'inactive', deleted_at = NOW()
       WHERE vendor_service_id = $1 AND vendor_id = $2 AND status = 'active'`,
      [serviceId, vendorId]
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
// SHOP IMAGE MANAGEMENT
// ============================================

// Upload shop images
const uploadShopImages = [
  upload.array('images', 10),
  async (req, res) => {
    const client = await db.pool.connect();
    
    try {
      const vendorId = req.user.userId;
      const { image_type } = req.body; // 'shop_profile_image' or 'shop_gallery_image'

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No images provided.'
        });
      }

      await client.query('BEGIN');

      const uploadedImages = [];

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const imageUrl = `/uploads/shops/${file.filename}`;
        const isPrimary = i === 0 && image_type === 'shop_profile_image';
        
        const result = await client.query(
          `INSERT INTO vendor_documents (
            vendor_id, document_url, document_type, is_primary, 
            verification_status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, 'approved', NOW(), NOW())
          RETURNING document_id, document_url, document_type`,
          [vendorId, imageUrl, image_type || 'shop_gallery_image', isPrimary]
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

// Get shop images
const getShopImages = async (req, res) => {
  try {
    const vendorId = req.user.userId;

    const result = await db.query(
      `SELECT document_id, document_url, document_type, is_primary, created_at
       FROM vendor_documents
       WHERE vendor_id = $1 
         AND document_type IN ('shop_profile_image', 'shop_gallery_image')
         AND status = 'active'
       ORDER BY is_primary DESC, created_at DESC`,
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

// Delete shop image
const deleteShopImage = async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { imageId } = req.params;

    const image = await db.query(
      'SELECT document_url FROM vendor_documents WHERE document_id = $1 AND vendor_id = $2 AND status = $3',
      [imageId, vendorId, 'active']
    );

    if (image.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Image not found.'
      });
    }

    await db.query(
      `UPDATE vendor_documents 
       SET status = 'inactive', deleted_at = NOW()
       WHERE document_id = $1`,
      [imageId]
    );

    // Optional: Delete physical file
    const filePath = path.join(__dirname, '..', image.rows[0].document_url);
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

// ============================================
// REVIEWS
// ============================================

// Get vendor reviews
const getMyReviews = async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const result = await db.query(
      `SELECT 
        r.review_id,
        r.rating,
        r.review_text,
        r.created_at,
        up.full_name as customer_name,
        (SELECT profile_picture FROM user_profiles 
         WHERE user_id = r.customer_id AND is_current = true) as customer_photo,
        b.booking_date
      FROM reviews r
      LEFT JOIN user_profiles up ON r.customer_id = up.user_id AND up.is_current = true
      LEFT JOIN bookings b ON r.booking_id = b.booking_id
      WHERE r.vendor_id = $1 AND r.status = 'active'
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3`,
      [vendorId, limit, offset]
    );

    const total = await db.query(
      'SELECT COUNT(*) FROM reviews WHERE vendor_id = $1 AND status = $2',
      [vendorId, 'active']
    );

    res.json({
      success: true,
      data: {
        reviews: result.rows,
        pagination: {
          total: parseInt(total.rows[0].count),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(parseInt(total.rows[0].count) / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reviews.',
      error: error.message
    });
  }
};

// ============================================
// NOTIFICATIONS
// ============================================

// Get notifications
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await db.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const total = await db.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1',
      [userId]
    );

    const unreadCount = await db.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId]
    );

    res.json({
      success: true,
      data: {
        notifications: result.rows,
        unread_count: parseInt(unreadCount.rows[0].count),
        pagination: {
          total: parseInt(total.rows[0].count),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(parseInt(total.rows[0].count) / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications.',
      error: error.message
    });
  }
};

// Mark notification as read
const markNotificationRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { notificationId } = req.params;

    await db.query(
      `UPDATE notifications 
       SET is_read = true, read_at = NOW()
       WHERE notification_id = $1 AND user_id = $2`,
      [notificationId, userId]
    );

    res.json({
      success: true,
      message: 'Notification marked as read.'
    });

  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating notification.',
      error: error.message
    });
  }
};

// Update FCM token
const updateFCMToken = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { fcm_token, device_id } = req.body;

    if (!fcm_token) {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required.'
      });
    }

    await db.query(
      `UPDATE user_profiles 
       SET fcm_token = $1, device_id = $2, updated_at = NOW()
       WHERE user_id = $3 AND is_current = true`,
      [fcm_token, device_id, userId]
    );

    res.json({
      success: true,
      message: 'FCM token updated successfully.'
    });

  } catch (error) {
    console.error('Update FCM token error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating FCM token.',
      error: error.message
    });
  }
};

module.exports = {
  // Onboarding
  completeProfileStep,
  completeShopDetailsStep,
  getAllServiceCategories,
  getServicesByCategory,
  addVendorServices,
  addCustomService,
  
  // Dashboard
  getDashboardStats,
  
  // Booking Management
  getAllBookings,
  getBookingDetails,
  createOfflineBooking,
  updateBookingStatus,
  
  // Service Management
  getMyServices,
  updateService,
  deleteService,
  
  // Shop Image Management
  uploadShopImages,
  getShopImages,
  deleteShopImage,
  
  // Reviews
  getMyReviews,
  
  // Notifications
  getNotifications,
  markNotificationRead,
  updateFCMToken
};