const db = require('../config/database');

// ============================================
// SERVICE MASTER MANAGEMENT
// ============================================

// Get all services
const getAllServices = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT * FROM services_master
      WHERE deleted_at IS NULL
    `;
    
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (search) {
      query += ` AND (service_name ILIKE $${paramCount} OR service_description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    // Count total
    const countQuery = `SELECT COUNT(*) FROM (${query}) as total_count`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    query += ` ORDER BY service_name ASC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: {
        services: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
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

// Get service by ID
const getServiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'SELECT * FROM services_master WHERE service_id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found.'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching service.',
      error: error.message
    });
  }
};

// Create new service
const createService = async (req, res) => {
  try {
    const {
      service_name,
      service_description,
      default_duration_minutes,
      service_type
    } = req.body;

    // Validation
    if (!service_name) {
      return res.status(400).json({
        success: false,
        message: 'Service name is required.'
      });
    }

    // Check if service already exists
    const existingService = await db.query(
      'SELECT service_id FROM services_master WHERE service_name = $1 AND deleted_at IS NULL',
      [service_name]
    );

    if (existingService.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Service with this name already exists.'
      });
    }

    // Insert service
    const result = await db.query(
      `INSERT INTO services_master (
        service_name, service_description, default_duration_minutes, service_type, status
      ) VALUES ($1, $2, $3, $4, 'active')
      RETURNING *`,
      [
        service_name,
        service_description,
        default_duration_minutes || 30, // Default 30 minutes
        service_type || 'normal'
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Service created successfully.',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating service.',
      error: error.message
    });
  }
};

// Update service
const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      service_name,
      service_description,
      default_duration_minutes,
      service_type,
      status
    } = req.body;

    // Check if service exists
    const serviceCheck = await db.query(
      'SELECT service_id FROM services_master WHERE service_id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found.'
      });
    }

    // Update service
    const result = await db.query(
      `UPDATE services_master SET
        service_name = COALESCE($1, service_name),
        service_description = COALESCE($2, service_description),
        default_duration_minutes = COALESCE($3, default_duration_minutes),
        service_type = COALESCE($4, service_type),
        status = COALESCE($5, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE service_id = $6
      RETURNING *`,
      [service_name, service_description, default_duration_minutes, service_type, status, id]
    );

    res.json({
      success: true,
      message: 'Service updated successfully.',
      data: result.rows[0]
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

// Delete service (soft delete)
const deleteService = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if service exists
    const serviceCheck = await db.query(
      'SELECT service_id FROM services_master WHERE service_id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found.'
      });
    }

    // Soft delete
    await db.query(
      'UPDATE services_master SET deleted_at = CURRENT_TIMESTAMP WHERE service_id = $1',
      [id]
    );

    res.json({
      success: true,
      message: 'Service deleted successfully.'
    });

  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting service.',
      error: error.message
    });
  }
};

// ============================================
// VENDOR SERVICE MANAGEMENT
// ============================================

// Get vendor services
const getVendorServices = async (req, res) => {
  try {
    const { vendorId } = req.params;

    const result = await db.query(
      `SELECT vs.*, sm.service_name, sm.service_description, sm.default_duration_minutes, sm.service_type
       FROM vendor_services vs
       JOIN services_master sm ON vs.service_id = sm.service_id
       WHERE vs.vendor_id = $1 AND vs.deleted_at IS NULL
       ORDER BY sm.service_name ASC`,
      [vendorId]
    );

    res.json({
      success: true,
      data: result.rows
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
    const { vendorId } = req.params;
    const { service_id, price, is_available } = req.body;

    // Validation
    if (!service_id || !price) {
      return res.status(400).json({
        success: false,
        message: 'Service ID and price are required.'
      });
    }

    // Check if service exists
    const serviceCheck = await db.query(
      'SELECT service_id FROM services_master WHERE service_id = $1 AND deleted_at IS NULL',
      [service_id]
    );

    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found.'
      });
    }

    // Check if vendor service already exists
    const existingVendorService = await db.query(
      'SELECT vendor_service_id FROM vendor_services WHERE vendor_id = $1 AND service_id = $2 AND deleted_at IS NULL',
      [vendorId, service_id]
    );

    if (existingVendorService.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'This service is already added to vendor.'
      });
    }

    // Add vendor service
    const result = await db.query(
      `INSERT INTO vendor_services (vendor_id, service_id, price, is_available, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING *`,
      [vendorId, service_id, price, is_available !== false]
    );

    res.status(201).json({
      success: true,
      message: 'Service added to vendor successfully.',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Add vendor service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding service to vendor.',
      error: error.message
    });
  }
};

// Update vendor service
const updateVendorService = async (req, res) => {
  try {
    const { vendorServiceId } = req.params;
    const { price, is_available } = req.body;

    // Check if vendor service exists
    const serviceCheck = await db.query(
      'SELECT vendor_service_id FROM vendor_services WHERE vendor_service_id = $1 AND deleted_at IS NULL',
      [vendorServiceId]
    );

    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor service not found.'
      });
    }

    // Update vendor service
    const result = await db.query(
      `UPDATE vendor_services SET
        price = COALESCE($1, price),
        is_available = COALESCE($2, is_available),
        updated_at = CURRENT_TIMESTAMP
      WHERE vendor_service_id = $3
      RETURNING *`,
      [price, is_available, vendorServiceId]
    );

    res.json({
      success: true,
      message: 'Vendor service updated successfully.',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Update vendor service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating vendor service.',
      error: error.message
    });
  }
};

// Delete vendor service (soft delete)
const deleteVendorService = async (req, res) => {
  try {
    const { vendorServiceId } = req.params;

    // Check if vendor service exists
    const serviceCheck = await db.query(
      'SELECT vendor_service_id FROM vendor_services WHERE vendor_service_id = $1 AND deleted_at IS NULL',
      [vendorServiceId]
    );

    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor service not found.'
      });
    }

    // Soft delete
    await db.query(
      'UPDATE vendor_services SET deleted_at = CURRENT_TIMESTAMP WHERE vendor_service_id = $1',
      [vendorServiceId]
    );

    res.json({
      success: true,
      message: 'Vendor service deleted successfully.'
    });

  } catch (error) {
    console.error('Delete vendor service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting vendor service.',
      error: error.message
    });
  }
};

module.exports = {
  // Service Master
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  
  // Vendor Services
  getVendorServices,
  addVendorService,
  updateVendorService,
  deleteVendorService
};