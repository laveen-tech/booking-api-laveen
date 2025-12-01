const db = require('../config/database');
const admin = require('../config/firebase');

// ============================================
// CUSTOMER DASHBOARD
// ============================================

const getDashboardStats = async (req, res) => {
  try {
    const customerId = req.user.userId;

    // Get total bookings
    const bookingsStats = await db.query(
      `SELECT 
        COUNT(*) as total_bookings,
        SUM(CASE WHEN booking_status = 'completed' THEN 1 ELSE 0 END) as completed_bookings,
        SUM(CASE WHEN booking_status = 'confirmed' THEN 1 ELSE 0 END) as upcoming_bookings,
        SUM(CASE WHEN booking_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_bookings
      FROM bookings
      WHERE customer_id = $1 AND status = 'active'`,
      [customerId]
    );

    // Get upcoming bookings
    const upcomingBookings = await db.query(
      `SELECT 
        b.booking_id,
        b.booking_date,
        b.booking_time,
        b.total_price,
        b.booking_status,
        vsd.shop_name,
        vsd.shop_address,
        vsd.city,
        up.full_name as vendor_name,
        u.phone_number as vendor_phone
      FROM bookings b
      INNER JOIN vendor_shop_details vsd ON b.vendor_id = vsd.vendor_id
      LEFT JOIN users u ON b.vendor_id = u.user_id
      LEFT JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
      WHERE b.customer_id = $1 
        AND b.booking_status = 'confirmed'
        AND b.booking_date >= CURRENT_DATE
        AND b.status = 'active'
      ORDER BY b.booking_date ASC, b.booking_time ASC
      LIMIT 5`,
      [customerId]
    );

    // Get favorite vendors (most booked)
    const favoriteVendors = await db.query(
      `SELECT 
        b.vendor_id,
        vsd.shop_name,
        vsd.city,
        vm.average_rating,
        vm.total_reviews,
        COUNT(b.booking_id) as booking_count
      FROM bookings b
      INNER JOIN vendor_shop_details vsd ON b.vendor_id = vsd.vendor_id
      LEFT JOIN vendor_metrics vm ON b.vendor_id = vm.vendor_id
      WHERE b.customer_id = $1 AND b.status = 'active'
      GROUP BY b.vendor_id, vsd.shop_name, vsd.city, vm.average_rating, vm.total_reviews
      ORDER BY booking_count DESC
      LIMIT 5`,
      [customerId]
    );

    const stats = bookingsStats.rows[0];

    res.json({
      success: true,
      data: {
        total_bookings: parseInt(stats.total_bookings) || 0,
        completed_bookings: parseInt(stats.completed_bookings) || 0,
        upcoming_bookings: parseInt(stats.upcoming_bookings) || 0,
        cancelled_bookings: parseInt(stats.cancelled_bookings) || 0,
        upcoming_appointments: upcomingBookings.rows,
        favorite_vendors: favoriteVendors.rows
      }
    });

  } catch (error) {
    console.error('Get customer dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics.',
      error: error.message
    });
  }
};

// ============================================
// SHOP DISCOVERY
// ============================================

// Get all shops with filters and search
const getAllShops = async (req, res) => {
  try {
    const { city, search, category, sort_by = 'rating', page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        u.user_id as vendor_id,
        vsd.shop_id,
        vsd.shop_name,
        vsd.shop_address,
        vsd.city,
        vsd.state,
        vsd.latitude,
        vsd.longitude,
        vsd.open_time,
        vsd.close_time,
        vm.average_rating,
        vm.total_reviews,
        vm.total_bookings,
        (SELECT document_url FROM vendor_documents 
         WHERE vendor_id = u.user_id 
           AND document_type = 'shop_profile_image' 
           AND status = 'active' 
         LIMIT 1) as profile_image,
        (SELECT COUNT(*) FROM vendor_services vs 
         WHERE vs.vendor_id = u.user_id 
           AND vs.status = 'active' 
           AND vs.is_available = true) as services_count
      FROM users u
      INNER JOIN vendor_shop_details vsd ON u.user_id = vsd.vendor_id
      LEFT JOIN vendor_metrics vm ON u.user_id = vm.vendor_id
      WHERE u.role = 'vendor' 
        AND u.status = 'active' 
        AND u.verification_status = 1
        AND vsd.verification_status = 1
    `;
    
    const params = [];
    let paramCount = 1;

    if (city) {
      query += ` AND vsd.city ILIKE $${paramCount}`;
      params.push(`%${city}%`);
      paramCount++;
    }

    if (search) {
      query += ` AND (vsd.shop_name ILIKE $${paramCount} OR vsd.shop_address ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    if (category) {
      query += ` AND EXISTS (
        SELECT 1 FROM vendor_services vs 
        INNER JOIN services_master sm ON vs.service_id = sm.service_id
        WHERE vs.vendor_id = u.user_id 
          AND sm.category = $${paramCount}
          AND vs.status = 'active'
      )`;
      params.push(category);
      paramCount++;
    }

    // Count total
    const countQuery = `SELECT COUNT(*) FROM (${query}) as total_count`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add sorting
    switch(sort_by) {
      case 'rating':
        query += ` ORDER BY vm.average_rating DESC NULLS LAST`;
        break;
      case 'reviews':
        query += ` ORDER BY vm.total_reviews DESC NULLS LAST`;
        break;
      case 'bookings':
        query += ` ORDER BY vm.total_bookings DESC NULLS LAST`;
        break;
      default:
        query += ` ORDER BY vm.average_rating DESC NULLS LAST`;
    }

    // Add pagination
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: {
        shops: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get all shops error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching shops.',
      error: error.message
    });
  }
};

// Get shop details by ID
const getShopDetails = async (req, res) => {
  try {
    const { shopId } = req.params;

    // Get shop basic details
    const shopQuery = `
      SELECT 
        u.user_id as vendor_id,
        vsd.shop_id,
        vsd.shop_name,
        vsd.shop_address,
        vsd.city,
        vsd.state,
        vsd.latitude,
        vsd.longitude,
        vsd.open_time,
        vsd.close_time,
        vsd.break_start_time,
        vsd.break_end_time,
        vsd.weekly_holiday,
        vsd.no_of_seats,
        vsd.no_of_workers,
        vm.average_rating,
        vm.total_reviews,
        vm.total_bookings,
        vm.completed_bookings,
        up.full_name as owner_name,
        u.phone_number as contact_number
      FROM users u
      INNER JOIN vendor_shop_details vsd ON u.user_id = vsd.vendor_id
      LEFT JOIN vendor_metrics vm ON u.user_id = vm.vendor_id
      LEFT JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
      WHERE vsd.shop_id = $1 
        AND u.status = 'active' 
        AND u.verification_status = 1
    `;

    const shop = await db.query(shopQuery, [shopId]);

    if (shop.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found or not available.'
      });
    }

    const shopData = shop.rows[0];

    // Get shop images
    const images = await db.query(
      `SELECT document_id, document_url, document_type, is_primary
       FROM vendor_documents
       WHERE vendor_id = $1 
         AND document_type IN ('shop_profile_image', 'shop_gallery_image')
         AND status = 'active'
       ORDER BY is_primary DESC, created_at DESC`,
      [shopData.vendor_id]
    );

    // Get shop services
    const services = await db.query(
      `SELECT 
        vs.vendor_service_id,
        sm.service_id,
        sm.service_name,
        sm.service_description as description,
        sm.category,
        vs.price,
        sm.default_duration_minutes as duration_minutes,
        vs.is_available
      FROM vendor_services vs
      INNER JOIN services_master sm ON vs.service_id = sm.service_id
      WHERE vs.vendor_id = $1 
        AND vs.status = 'active'
        AND sm.status = 'active'
        AND vs.is_available = true
      ORDER BY sm.category, sm.service_name`,
      [shopData.vendor_id]
    );

    // Get recent reviews
    const reviews = await db.query(
      `SELECT 
        r.review_id,
        r.rating,
        r.review_text,
        r.created_at,
        up.full_name as customer_name,
        (SELECT profile_picture FROM user_profiles 
         WHERE user_id = r.customer_id AND is_current = true) as customer_photo
      FROM reviews r
      LEFT JOIN user_profiles up ON r.customer_id = up.user_id AND up.is_current = true
      WHERE r.vendor_id = $1 AND r.status = 'active'
      ORDER BY r.created_at DESC
      LIMIT 10`,
      [shopData.vendor_id]
    );

    res.json({
      success: true,
      data: {
        ...shopData,
        images: images.rows,
        services: services.rows,
        reviews: reviews.rows
      }
    });

  } catch (error) {
    console.error('Get shop details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching shop details.',
      error: error.message
    });
  }
};

// Get available time slots for booking
const getAvailableSlots = async (req, res) => {
  try {
    const { shopId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required.'
      });
    }

    // Get shop details
    const shop = await db.query(
      `SELECT 
        vendor_id,
        open_time,
        close_time,
        break_start_time,
        break_end_time,
        weekly_holiday,
        no_of_seats
      FROM vendor_shop_details
      WHERE shop_id = $1`,
      [shopId]
    );

    if (shop.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found.'
      });
    }

    const shopData = shop.rows[0];
    const bookingDate = new Date(date);
    const dayOfWeek = bookingDate.toLocaleDateString('en-US', { weekday: 'long' });

    // Check if shop is closed on this day
    if (shopData.weekly_holiday && shopData.weekly_holiday.toLowerCase() === dayOfWeek.toLowerCase()) {
      return res.json({
        success: true,
        data: {
          is_closed: true,
          message: `Shop is closed on ${dayOfWeek}`,
          available_slots: []
        }
      });
    }

    // Get existing bookings for this date
    const existingBookings = await db.query(
      `SELECT booking_time, COUNT(*) as bookings_count
       FROM bookings
       WHERE vendor_id = $1 
         AND booking_date = $2
         AND booking_status IN ('confirmed', 'completed')
         AND status = 'active'
       GROUP BY booking_time`,
      [shopData.vendor_id, date]
    );

    // Generate time slots (30-minute intervals)
    const slots = [];
    const openTime = shopData.open_time;
    const closeTime = shopData.close_time;
    const breakStart = shopData.break_start_time;
    const breakEnd = shopData.break_end_time;

    let currentTime = new Date(`2000-01-01 ${openTime}`);
    const endTime = new Date(`2000-01-01 ${closeTime}`);
    const slotDuration = 30; // minutes

    while (currentTime < endTime) {
      const timeString = currentTime.toTimeString().slice(0, 5);
      
      // Check if slot is during break time
      let isDuringBreak = false;
      if (breakStart && breakEnd) {
        const slotTime = new Date(`2000-01-01 ${timeString}`);
        const breakStartTime = new Date(`2000-01-01 ${breakStart}`);
        const breakEndTime = new Date(`2000-01-01 ${breakEnd}`);
        isDuringBreak = slotTime >= breakStartTime && slotTime < breakEndTime;
      }

      // Check availability
      const booking = existingBookings.rows.find(b => b.booking_time === timeString + ':00');
      const bookedSeats = booking ? parseInt(booking.bookings_count) : 0;
      const availableSeats = shopData.no_of_seats - bookedSeats;

      slots.push({
        time: timeString,
        available_seats: isDuringBreak ? 0 : availableSeats,
        is_available: !isDuringBreak && availableSeats > 0,
        is_break: isDuringBreak
      });

      currentTime.setMinutes(currentTime.getMinutes() + slotDuration);
    }

    res.json({
      success: true,
      data: {
        is_closed: false,
        date: date,
        open_time: openTime,
        close_time: closeTime,
        break_start_time: breakStart,
        break_end_time: breakEnd,
        total_seats: shopData.no_of_seats,
        available_slots: slots
      }
    });

  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available slots.',
      error: error.message
    });
  }
};

// ============================================
// BOOKING MANAGEMENT
// ============================================

// Create booking
const createBooking = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const customerId = req.user.userId;
    const { vendor_id, booking_date, booking_time, services, notes } = req.body;

    // Validation
    if (!vendor_id || !booking_date || !booking_time || !services || services.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vendor ID, booking date, time, and services are required.'
      });
    }

    await client.query('BEGIN');

    // Verify vendor exists and is active
    const vendorCheck = await client.query(
      'SELECT user_id, verification_status FROM users WHERE user_id = $1 AND role = $2 AND status = $3',
      [vendor_id, 'vendor', 'active']
    );

    if (vendorCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Vendor not found or not available.'
      });
    }

    if (vendorCheck.rows[0].verification_status !== 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Vendor is not verified.'
      });
    }

    // Check slot availability
    const shopDetails = await client.query(
      'SELECT no_of_seats FROM vendor_shop_details WHERE vendor_id = $1',
      [vendor_id]
    );

    const existingBookings = await client.query(
      `SELECT COUNT(*) as count FROM bookings 
       WHERE vendor_id = $1 AND booking_date = $2 AND booking_time = $3 
         AND booking_status IN ('confirmed', 'completed') AND status = 'active'`,
      [vendor_id, booking_date, booking_time]
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

    // Calculate total price and duration
    let totalPrice = 0;
    let totalDuration = 0;

    for (const service of services) {
      const serviceCheck = await client.query(
        `SELECT vs.price, sm.default_duration_minutes 
         FROM vendor_services vs
         INNER JOIN services_master sm ON vs.service_id = sm.service_id
         WHERE vs.vendor_service_id = $1 AND vs.vendor_id = $2 AND vs.status = 'active'`,
        [service.vendor_service_id, vendor_id]
      );

      if (serviceCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Service ID ${service.vendor_service_id} not found for this vendor.`
        });
      }

      totalPrice += parseFloat(serviceCheck.rows[0].price);
      totalDuration += parseInt(serviceCheck.rows[0].default_duration_minutes);
    }

    // Create booking
    const bookingResult = await client.query(
      `INSERT INTO bookings (
        customer_id,
        vendor_id,
        booking_date,
        booking_time,
        total_price,
        total_duration_minutes,
        booking_status,
        payment_method,
        payment_status,
        customer_notes,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', 'cash', 'pending', $7, NOW(), NOW())
      RETURNING booking_id, booking_date, booking_time, total_price`,
      [customerId, vendor_id, booking_date, booking_time, totalPrice, totalDuration, notes]
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

    // Update vendor metrics
    await client.query(
      `UPDATE vendor_metrics 
       SET total_bookings = COALESCE(total_bookings, 0) + 1,
           updated_at = NOW()
       WHERE vendor_id = $1`,
      [vendor_id]
    );

    await client.query('COMMIT');

    // Send notification to vendor
    try {
      const vendorFCM = await client.query(
        'SELECT fcm_token FROM user_profiles WHERE user_id = $1 AND is_current = true',
        [vendor_id]
      );

      if (vendorFCM.rows[0]?.fcm_token) {
        await admin.messaging().send({
          token: vendorFCM.rows[0].fcm_token,
          notification: {
            title: 'New Booking Received',
            body: `New booking for ${booking_date} at ${booking_time}`
          },
          data: {
            type: 'new_booking',
            booking_id: booking.booking_id.toString()
          }
        });
      }
    } catch (notifError) {
      console.error('Notification error:', notifError);
    }

    res.status(201).json({
      success: true,
      message: 'Booking created successfully.',
      data: booking
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating booking.',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Get customer bookings
const getMyBookings = async (req, res) => {
  try {
    const customerId = req.user.userId;
    const { status, page = 1, limit = 10 } = req.query;
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
        b.vendor_notes,
        b.created_at,
        vsd.shop_name,
        vsd.shop_address,
        vsd.city,
        up.full_name as vendor_name,
        u.phone_number as vendor_phone,
        (SELECT document_url FROM vendor_documents 
         WHERE vendor_id = b.vendor_id 
           AND document_type = 'shop_profile_image' 
           AND status = 'active' 
         LIMIT 1) as shop_image,
        (SELECT COUNT(*) FROM booking_services 
         WHERE booking_id = b.booking_id AND status = 'active') as services_count
      FROM bookings b
      INNER JOIN vendor_shop_details vsd ON b.vendor_id = vsd.vendor_id
      LEFT JOIN users u ON b.vendor_id = u.user_id
      LEFT JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
      WHERE b.customer_id = $1 AND b.status = 'active'
    `;
    
    const params = [customerId];
    let paramCount = 2;

    if (status) {
      query += ` AND b.booking_status = $${paramCount}`;
      params.push(status);
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
    console.error('Get bookings error:', error);
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
    const customerId = req.user.userId;
    const { bookingId } = req.params;

    const booking = await db.query(
      `SELECT 
        b.*,
        vsd.shop_name,
        vsd.shop_address,
        vsd.city,
        vsd.state,
        vsd.latitude,
        vsd.longitude,
        up.full_name as vendor_name,
        u.phone_number as vendor_phone,
        (SELECT document_url FROM vendor_documents 
         WHERE vendor_id = b.vendor_id 
           AND document_type = 'shop_profile_image' 
           AND status = 'active' 
         LIMIT 1) as shop_image
      FROM bookings b
      INNER JOIN vendor_shop_details vsd ON b.vendor_id = vsd.vendor_id
      LEFT JOIN users u ON b.vendor_id = u.user_id
      LEFT JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
      WHERE b.booking_id = $1 AND b.customer_id = $2 AND b.status = 'active'`,
      [bookingId, customerId]
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

// Cancel booking
const cancelBooking = async (req, res) => {
  try {
    const customerId = req.user.userId;
    const { bookingId } = req.params;
    const { cancellation_reason } = req.body;

    if (!cancellation_reason) {
      return res.status(400).json({
        success: false,
        message: 'Cancellation reason is required.'
      });
    }

    // Check if booking exists and belongs to customer
    const booking = await db.query(
      `SELECT booking_id, vendor_id, booking_status, booking_date 
       FROM bookings 
       WHERE booking_id = $1 AND customer_id = $2 AND status = 'active'`,
      [bookingId, customerId]
    );

    if (booking.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found.'
      });
    }

    if (booking.rows[0].booking_status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Booking is already cancelled.'
      });
    }

    if (booking.rows[0].booking_status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel completed booking.'
      });
    }

    // Update booking
    await db.query(
      `UPDATE bookings 
       SET booking_status = 'cancelled',
           cancellation_reason = $1,
           cancelled_by = 'customer',
           updated_at = NOW()
       WHERE booking_id = $2`,
      [cancellation_reason, bookingId]
    );

    // Update vendor metrics
    await db.query(
      `UPDATE vendor_metrics 
       SET cancelled_bookings = COALESCE(cancelled_bookings, 0) + 1,
           updated_at = NOW()
       WHERE vendor_id = $1`,
      [booking.rows[0].vendor_id]
    );

    // Send notification to vendor
    try {
      const vendorFCM = await db.query(
        'SELECT fcm_token FROM user_profiles WHERE user_id = $1 AND is_current = true',
        [booking.rows[0].vendor_id]
      );

      if (vendorFCM.rows[0]?.fcm_token) {
        await admin.messaging().send({
          token: vendorFCM.rows[0].fcm_token,
          notification: {
            title: 'Booking Cancelled',
            body: `A booking has been cancelled by customer`
          },
          data: {
            type: 'booking_cancelled',
            booking_id: bookingId.toString()
          }
        });
      }
    } catch (notifError) {
      console.error('Notification error:', notifError);
    }

    res.json({
      success: true,
      message: 'Booking cancelled successfully.'
    });

  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling booking.',
      error: error.message
    });
  }
};

// ============================================
// REVIEWS
// ============================================

// Add review
const addReview = async (req, res) => {
  try {
    const customerId = req.user.userId;
    const { booking_id, rating, review_text } = req.body;

    // Validation
    if (!booking_id || !rating) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID and rating are required.'
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5.'
      });
    }

    // Check if booking exists and is completed
    const booking = await db.query(
      `SELECT vendor_id, booking_status FROM bookings 
       WHERE booking_id = $1 AND customer_id = $2 AND status = 'active'`,
      [booking_id, customerId]
    );

    if (booking.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found.'
      });
    }

    if (booking.rows[0].booking_status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only review completed bookings.'
      });
    }

    // Check if review already exists
    const existingReview = await db.query(
      'SELECT review_id FROM reviews WHERE booking_id = $1 AND status = $2',
      [booking_id, 'active']
    );

    if (existingReview.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this booking.'
      });
    }

    // Add review
    const result = await db.query(
      `INSERT INTO reviews (
        booking_id,
        customer_id,
        vendor_id,
        rating,
        review_text,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING review_id`,
      [booking_id, customerId, booking.rows[0].vendor_id, rating, review_text]
    );

    // Update vendor metrics
    const metrics = await db.query(
      `SELECT average_rating, total_reviews FROM vendor_metrics 
       WHERE vendor_id = $1`,
      [booking.rows[0].vendor_id]
    );

    const currentRating = parseFloat(metrics.rows[0]?.average_rating || 0);
    const currentReviews = parseInt(metrics.rows[0]?.total_reviews || 0);
    const newAverageRating = ((currentRating * currentReviews) + rating) / (currentReviews + 1);

    await db.query(
      `UPDATE vendor_metrics 
       SET average_rating = $1,
           total_reviews = total_reviews + 1,
           updated_at = NOW()
       WHERE vendor_id = $2`,
      [newAverageRating, booking.rows[0].vendor_id]
    );

    res.status(201).json({
      success: true,
      message: 'Review added successfully.',
      data: {
        review_id: result.rows[0].review_id
      }
    });

  } catch (error) {
    console.error('Add review error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding review.',
      error: error.message
    });
  }
};

// ============================================
// CATEGORIES & SERVICES
// ============================================

// Get all categories
const getAllCategories = async (req, res) => {
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
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching categories.',
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
    console.error('Get services error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching services.',
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

// Mark all notifications as read
const markAllNotificationsRead = async (req, res) => {
  try {
    const userId = req.user.userId;

    await db.query(
      `UPDATE notifications 
       SET is_read = true, read_at = NOW()
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );

    res.json({
      success: true,
      message: 'All notifications marked as read.'
    });

  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating notifications.',
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
  getDashboardStats,
  getAllShops,
  getShopDetails,
  getAvailableSlots,
  createBooking,
  getMyBookings,
  getBookingDetails,
  cancelBooking,
  addReview,
  getAllCategories,
  getServicesByCategory,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  updateFCMToken
};