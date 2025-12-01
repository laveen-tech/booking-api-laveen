const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const { verifyToken, isVendor } = require('../middleware/auth');

// All vendor routes require authentication and vendor role
router.use(verifyToken);
router.use(isVendor);

// ============================================
// DASHBOARD
// ============================================

router.get('/dashboard/stats', vendorController.getDashboardStats);

// ============================================
// SERVICE MANAGEMENT
// ============================================

// Get all services from master
router.get('/services/master', vendorController.getAllServicesMaster);

// Get vendor's services
router.get('/services', vendorController.getVendorServices);

// Add single service
router.post('/services', vendorController.addVendorService);

// Add multiple services
router.post('/services/bulk', vendorController.addMultipleVendorServices);

// Update service
router.put('/services/:service_id', vendorController.updateVendorService);

// Toggle service availability
router.patch('/services/:service_id/availability', vendorController.toggleServiceAvailability);

// Delete service
router.delete('/services/:service_id', vendorController.deleteVendorService);

// ============================================
// IMAGE MANAGEMENT
// ============================================

// Upload images
router.post('/images', vendorController.uploadShopImages);

// Get images
router.get('/images', vendorController.getVendorImages);

// Delete image
router.delete('/images/:image_id', vendorController.deleteVendorImage);

module.exports = router;