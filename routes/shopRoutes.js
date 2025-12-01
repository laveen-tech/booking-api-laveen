const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController');
const { verifyToken, isAdmin } = require('../middleware/auth');

// All shop routes require authentication and admin privileges
router.use(verifyToken);
router.use(isAdmin);

// Shop Management
router.get('/shops', shopController.getAllShops);
router.get('/shops/:id', shopController.getShopById);
router.post('/shops', shopController.createShop);
router.put('/shops/:id', shopController.updateShop);
router.delete('/shops/:id', shopController.deleteShop);
router.put('/shops/:id/verification', shopController.updateShopVerification);

module.exports = router;