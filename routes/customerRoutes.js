const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { verifyToken, isCustomer } = require('../middleware/auth');

// All customer routes require authentication
router.use(verifyToken);

// ============================================
// DASHBOARD
// ============================================

router.get('/dashboard/stats', customerController.getDashboardStats);

// ============================================
// SHOP DISCOVERY
// ============================================

router.get('/shops', customerController.getAllShops);
router.get('/shops/:shopId', customerController.getShopDetails);
router.get('/shops/:shopId/available-slots', customerController.getAvailableSlots);

// ============================================
// BOOKING MANAGEMENT
// ============================================

router.post('/bookings', customerController.createBooking);
router.get('/bookings', customerController.getMyBookings);
router.get('/bookings/:bookingId', customerController.getBookingDetails);
router.put('/bookings/:bookingId/cancel', customerController.cancelBooking);

// ============================================
// REVIEWS
// ============================================

router.post('/reviews', customerController.addReview);

// ============================================
// CATEGORIES & SERVICES
// ============================================

router.get('/categories', customerController.getAllCategories);
router.get('/categories/:category/services', customerController.getServicesByCategory);

// ============================================
// NOTIFICATIONS
// ============================================

router.get('/notifications', customerController.getNotifications);
router.put('/notifications/:notificationId/read', customerController.markNotificationRead);
router.put('/notifications/read-all', customerController.markAllNotificationsRead);
router.put('/fcm-token', customerController.updateFCMToken);

module.exports = router;