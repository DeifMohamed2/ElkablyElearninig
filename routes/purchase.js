const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middlewares/auth');
const {
  getCart,
  clearCartAPI,
  addToCart,
  removeFromCart,
  getCheckout,
  getBookCheckout,
  directCheckout,
  processPayment,
  handlePaymentSuccess,
  handlePaymentFailure,
  handlePaymobWebhook,
  handlePaymobWebhookRedirect,
  getPurchaseHistory,
  addToWishlist,
  removeFromWishlist,
  toggleWishlist,
  validateCartMiddleware,
  validatePromoCode,
  removePromoCode,
} = require('../controllers/purchaseController');

// Cart routes
router.post('/cart', getCart);
router.post('/cart/add', ensureAuthenticated, addToCart);
router.post('/cart/remove', ensureAuthenticated, removeFromCart);
router.post('/cart/clear', ensureAuthenticated, clearCartAPI);

// Book checkout route (no cart validation needed)
router.get(
  '/checkout/book',
  ensureAuthenticated,
  getBookCheckout
);

// Checkout routes (with cart validation middleware)
router.get(
  '/checkout',
  ensureAuthenticated,
  validateCartMiddleware,
  getCheckout
);
router.post(
  '/checkout/direct',
  ensureAuthenticated,
  validateCartMiddleware,
  directCheckout
);
router.post(
  '/checkout/process',
  ensureAuthenticated,
  validateCartMiddleware,
  processPayment
);

// Payment result routes
router.get('/payment/success', handlePaymentSuccess);
router.get('/payment/fail', handlePaymentFailure);

// Handle Paymob redirect callback (when user returns from payment)
router.get('/webhook', handlePaymobWebhookRedirect);

// Webhook route (no authentication required for webhooks)
router.post('/webhook/paymob', handlePaymobWebhook);
// Also handle GET webhook for redirect callbacks
router.get('/webhook/paymob', handlePaymobWebhookRedirect);

// Order routes
router.get('/purchase-history', ensureAuthenticated, getPurchaseHistory);

// Wishlist routes
router.post('/wishlist/add', ensureAuthenticated, addToWishlist);
router.post('/wishlist/remove', ensureAuthenticated, removeFromWishlist);
router.post('/wishlist/toggle', ensureAuthenticated, toggleWishlist);

// Promo Code routes
router.post('/promo-code/validate', ensureAuthenticated, validateCartMiddleware, validatePromoCode);
router.post('/promo-code/remove', ensureAuthenticated, validateCartMiddleware, removePromoCode);

module.exports = router;
