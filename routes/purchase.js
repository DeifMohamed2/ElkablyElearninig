const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middlewares/auth');
const { 
  getCart, 
  addToCart, 
  removeFromCart, 
  getCheckout, 
  directCheckout,
  processPayment, 
  getPurchaseHistory,
  addToWishlist,
  removeFromWishlist,
  toggleWishlist
} = require('../controllers/purchaseController');

// Cart routes
router.post('/cart', ensureAuthenticated, getCart);
router.post('/cart/add', ensureAuthenticated, addToCart);
router.post('/cart/remove', ensureAuthenticated, removeFromCart);

// Checkout routes
router.get('/checkout', ensureAuthenticated, getCheckout);
router.post('/checkout/direct', ensureAuthenticated, directCheckout);
router.post('/checkout/process', ensureAuthenticated, processPayment);

// Order routes
router.get('/purchase-history', ensureAuthenticated, getPurchaseHistory);

// Wishlist routes
router.post('/wishlist/add', ensureAuthenticated, addToWishlist);
router.post('/wishlist/remove', ensureAuthenticated, removeFromWishlist);
router.post('/wishlist/toggle', ensureAuthenticated, toggleWishlist);

module.exports = router;
