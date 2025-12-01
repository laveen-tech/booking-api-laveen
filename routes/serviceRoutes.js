const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { verifyToken, isAdmin } = require('../middleware/auth');

// All service routes require authentication and admin privileges
router.use(verifyToken);
router.use(isAdmin);

// Service Master Management
router.get('/services', serviceController.getAllServices);
router.get('/services/:id', serviceController.getServiceById);
router.post('/services', serviceController.createService);
router.put('/services/:id', serviceController.updateService);
router.delete('/services/:id', serviceController.deleteService);

// Vendor Service Management
router.get('/vendors/:vendorId/services', serviceController.getVendorServices);
router.post('/vendors/:vendorId/services', serviceController.addVendorService);
router.put('/vendor-services/:vendorServiceId', serviceController.updateVendorService);
router.delete('/vendor-services/:vendorServiceId', serviceController.deleteVendorService);

module.exports = router;