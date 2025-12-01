const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const { verifyToken, isVendor } = require('../middleware/auth');

// All vendor routes require authentication and vendor role
router.use(verifyToken);
router.use(isVendor);

// ============================================
// VENDOR ONBOARDING - 3 STEPS
// ============================================

// Step 1: Complete Profile
router.post('/onboarding/profile', vendorController.completeProfileStep);

// Step 2: Complete Shop Details
router.post('/onboarding/shop-details', vendorController.completeShopDetailsStep);

// Step 3: Add Services
router.get('/onboarding/service-categories', vendorController.getAllServiceCategories);
router.get('/onboarding/categories/:category/services', vendorController.getServicesByCategory);
router.post('/onboarding/services', vendorController.addVendorServices);
router.post('/onboarding/custom-service', vendorController.addCustomService);

// ============================================
// DASHBOARD
// ============================================

router.get('/dashboard/stats', vendorController.getDashboardStats);

// ============================================
// BOOKING MANAGEMENT
// ============================================

router.get('/bookings', vendorController.getAllBookings);
router.get('/bookings/:bookingId', vendorController.getBookingDetails);
router.post('/bookings/offline', vendorController.createOfflineBooking);
router.put('/bookings/:bookingId/status', vendorController.updateBookingStatus);

// ============================================
// SERVICE MANAGEMENT
// ============================================

router.get('/services', vendorController.getMyServices);
router.put('/services/:serviceId', vendorController.updateService);
router.delete('/services/:serviceId', vendorController.deleteService);

// ============================================
// SHOP IMAGE MANAGEMENT
// ============================================

router.post('/shop/images', vendorController.uploadShopImages);
router.get('/shop/images', vendorController.getShopImages);
router.delete('/shop/images/:imageId', vendorController.deleteShopImage);

// ============================================
// REVIEWS
// ============================================

router.get('/reviews', vendorController.getMyReviews);

// ============================================
// NOTIFICATIONS
// ============================================

router.get('/notifications', vendorController.getNotifications);
router.put('/notifications/:notificationId/read', vendorController.markNotificationRead);
router.put('/fcm-token', vendorController.updateFCMToken);

module.exports = router;