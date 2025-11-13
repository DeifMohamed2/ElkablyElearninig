const Purchase = require('../models/Purchase');
const User = require('../models/User');
const BundleCourse = require('../models/BundleCourse');
const Course = require('../models/Course');
const PromoCode = require('../models/PromoCode');
const crypto = require('crypto');
const paymobService = require('../utils/paymobService');
const whatsappNotificationService = require('../utils/whatsappNotificationService');

// Simple UUID v4 generator
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Helper function to recalculate cart totals from database
async function recalculateCartFromDB(cart, userId = null) {
  if (!cart || cart.length === 0) {
    return {
      items: [],
      subtotal: 0,
      tax: 0,
      total: 0,
      validItems: [],
    };
  }

  const validItems = [];
  let subtotal = 0;

  // If userId is provided, get user's purchased items to check for duplicates
  let user = null;
  if (userId) {
    user = await User.findById(userId)
      .populate('purchasedBundles.bundle')
      .populate('purchasedCourses.course')
      .populate('enrolledCourses.course');
  }

  for (const cartItem of cart) {
    try {
      // Check if user already purchased this item
      if (user) {
        if (cartItem.type === 'bundle' && user.hasPurchasedBundle(cartItem.id)) {
          console.log(`Removing already purchased bundle from cart: ${cartItem.id}`);
          continue;
        }
        if (cartItem.type === 'course' && user.hasAccessToCourse(cartItem.id)) {
          console.log(`Removing already purchased course from cart: ${cartItem.id}`);
          continue;
        }
      }

      let dbItem;
      if (cartItem.type === 'bundle') {
        dbItem = await BundleCourse.findById(cartItem.id).select(
          'title price discountPrice thumbnail status isActive'
        );
      } else {
        dbItem = await Course.findById(cartItem.id).select(
          'title price discountPrice thumbnail status isActive'
        );
      }

      // Only include valid, active items
      if (
        dbItem &&
        dbItem.isActive &&
        ((cartItem.type === 'bundle' && dbItem.status === 'published') ||
          (cartItem.type === 'course' && dbItem.status === 'published'))
      ) {
        // Calculate final price considering discount
        const originalPrice = dbItem.price || 0;
        const discountPercentage = dbItem.discountPrice || 0;
        let finalPrice = originalPrice;

        if (discountPercentage > 0) {
          finalPrice =
            originalPrice - originalPrice * (discountPercentage / 100);
        }

        const validItem = {
          id: cartItem.id,
          type: cartItem.type,
          title: dbItem.title,
          originalPrice: originalPrice,
          discountPrice: discountPercentage,
          price: finalPrice, // Final price after discount
          image: dbItem.thumbnail || '/images/adad.png',
          addedAt: cartItem.addedAt,
        };

        validItems.push(validItem);
        subtotal += finalPrice;
      } else {
        console.log(
          `Removing invalid item from cart: ${cartItem.id} (${cartItem.type})`
        );
      }
    } catch (error) {
      console.error(`Error validating cart item ${cartItem.id}:`, error);
    }
  }

  const tax = 0; // No tax
  const total = subtotal + tax;

  return {
    items: validItems,
    subtotal,
    tax,
    total,
    validItems,
  };
}

// Helper function to clear cart after successful payment
function clearCart(req, reason = 'successful payment') {
  const cartCount = req.session.cart ? req.session.cart.length : 0;

  // Only clear if there are items in the cart
  if (cartCount > 0) {
    req.session.cart = [];
    // Force save the session
    req.session.save((err) => {
      if (err) {
        console.error('Error saving session after clearing cart:', err);
      } else {
        console.log(`Cart cleared after ${reason}. ${cartCount} items removed.`);
      }
    });
  } else {
    console.log(
      `Cart was already empty when attempting to clear after ${reason}.`
    );
  }

  return cartCount;
}

// Middleware to validate and recalculate cart items from database
const validateCartMiddleware = async (req, res, next) => {
  try {
    if (req.session.cart && req.session.cart.length > 0) {
      console.log('Validating cart items from database...');
      const userId = req.session.user ? req.session.user.id : null;
      const recalculatedCart = await recalculateCartFromDB(req.session.cart, userId);

      // Update session cart with validated items
      req.session.cart = recalculatedCart.validItems;

      // Attach validated cart data to request for use in controllers
      req.validatedCart = {
        items: recalculatedCart.items,
        subtotal: recalculatedCart.subtotal,
        tax: recalculatedCart.tax,
        total: recalculatedCart.total,
        cartCount: recalculatedCart.items.length,
      };

      console.log(
        `Cart validation complete. ${recalculatedCart.items.length} valid items, total: EGP${recalculatedCart.total}`
      );
    } else {
      req.validatedCart = {
        items: [],
        subtotal: 0,
        tax: 0,
        total: 0,
        cartCount: 0,
      };
    }

    next();
  } catch (error) {
    console.error('Error validating cart:', error);
    // Clear invalid cart and continue
    req.session.cart = [];
    req.validatedCart = {
      items: [],
      subtotal: 0,
      tax: 0,
      total: 0,
      cartCount: 0,
    };
    next();
  }
};

// Helper function to validate and apply promo code
async function validateAndApplyPromoCode(promoCode, userId, cartItems, subtotal, userEmail = null) {
  try {
    // Check if promo code exists and is valid
    const promo = await PromoCode.findValidPromoCode(promoCode, userId, userEmail);
    
    if (!promo) {
      throw new Error('Invalid or expired promo code');
    }

    // Check if user has already used this promo code
    if (!promo.canUserUse(userId, userEmail)) {
      if (promo.restrictToStudents) {
        throw new Error('This promo code is not available for your account');
      }
      throw new Error('You have already used this promo code');
    }

    // Calculate discount
    const discountAmount = promo.calculateDiscount(subtotal, cartItems);
    const finalAmount = subtotal - discountAmount;

    // SECURITY: Ensure final amount is not negative
    if (finalAmount < 0) {
      throw new Error('Invalid discount amount');
    }

    // SECURITY: Ensure discount doesn't exceed subtotal
    if (discountAmount > subtotal) {
      throw new Error('Discount amount cannot exceed order total');
    }

    return {
      success: true,
      promoCode: promo,
      discountAmount,
      finalAmount,
      originalAmount: subtotal
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// API endpoint to validate promo code
const validatePromoCode = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'Please login to use promo codes'
      });
    }

    const { promoCode } = req.body;
    const validatedCart = req.validatedCart;

    if (!promoCode) {
      return res.status(400).json({
        success: false,
        message: 'Promo code is required'
      });
    }

    if (validatedCart.cartCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    const result = await validateAndApplyPromoCode(
      promoCode,
      req.session.user.id,
      validatedCart.items,
      validatedCart.subtotal,
      req.session.user.email || req.session.user.studentEmail
    );

    if (result.success) {
      // Store promo code in session for checkout
      req.session.appliedPromoCode = {
        code: result.promoCode.code,
        id: result.promoCode._id,
        discountAmount: result.discountAmount,
        finalAmount: result.finalAmount,
        originalAmount: result.originalAmount
      };

      res.json({
        success: true,
        message: 'Promo code applied successfully',
        discountAmount: result.discountAmount,
        finalAmount: result.finalAmount,
        originalAmount: result.originalAmount,
        promoCode: result.promoCode.code
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    console.error('Error validating promo code:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating promo code'
    });
  }
};

// API endpoint to remove promo code
const removePromoCode = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'Please login to manage promo codes'
      });
    }

    // Remove promo code from session
    delete req.session.appliedPromoCode;

    const validatedCart = req.validatedCart || { subtotal: 0 };

    res.json({
      success: true,
      message: 'Promo code removed successfully',
      originalAmount: validatedCart.subtotal,
      finalAmount: validatedCart.subtotal,
      discountAmount: 0
    });
  } catch (error) {
    console.error('Error removing promo code:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing promo code'
    });
  }
};

// Helper function to clear invalid promo code from session
const clearInvalidPromoCode = (req) => {
  if (req.session.appliedPromoCode) {
    console.log('Clearing invalid promo code from session:', req.session.appliedPromoCode.code);
    delete req.session.appliedPromoCode;
  }
};

// Get cart data (for API calls)
const getCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'Please login to view your cart',
      });
    }

    // Get cart from session and recalculate from database
    const cart = req.session.cart || [];
    const recalculatedCart = await recalculateCartFromDB(cart);

    // Update session cart with validated items
    req.session.cart = recalculatedCart.validItems;

    res.json({
      success: true,
      cart: recalculatedCart.items,
      subtotal: recalculatedCart.subtotal,
      tax: recalculatedCart.tax,
      total: recalculatedCart.total,
      cartCount: recalculatedCart.items.length,
    });
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading cart',
    });
  }
};

// Clear cart API endpoint
const clearCartAPI = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'Please login',
      });
    }

    const cartCount = req.session.cart ? req.session.cart.length : 0;
    req.session.cart = [];
    
    // Force save the session
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`Cart cleared via API. ${cartCount} items removed.`);

    res.json({
      success: true,
      message: 'Cart cleared successfully',
      cartCount: 0,
    });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({
      success: false,
      message: 'Error clearing cart',
    });
  }
};

// Add item to cart
const addToCart = async (req, res) => {
  try {
    const { itemId, itemType } = req.body;

    console.log('Add to cart request:', {
      itemId,
      itemType,
    });
    console.log('Session user:', req.session.user);

    if (!req.session.user) {
      console.log('No user in session, returning 401');
      return res.status(401).json({
        success: false,
        message: 'Please login to add items to cart',
      });
    }

    // Validate item exists and get price from database
    let item;
    if (itemType === 'bundle') {
      item = await BundleCourse.findById(itemId).select(
        'title price discountPrice thumbnail status isActive'
      );
    } else {
      item = await Course.findById(itemId).select(
        'title price discountPrice thumbnail status isActive'
      );
    }

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found',
      });
    }

    // Validate item is available for purchase
    if (
      itemType === 'bundle' &&
      (!item.isActive || item.status !== 'published')
    ) {
      return res.status(400).json({
        success: false,
        message: 'This bundle is not available for purchase',
      });
    }

    if (
      itemType === 'course' &&
      (!item.isActive || item.status !== 'published')
    ) {
      return res.status(400).json({
        success: false,
        message: 'This course is not available for purchase',
      });
    }

    // Check if user already purchased this item by querying the database
    const user = await User.findById(req.session.user.id)
      .populate('purchasedBundles.bundle')
      .populate('purchasedCourses.course')
      .populate('enrolledCourses.course');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (itemType === 'bundle' && user.hasPurchasedBundle(itemId)) {
      return res.status(400).json({
        success: false,
        message: 'You have already purchased this bundle',
      });
    }

    if (itemType === 'course' && user.hasAccessToCourse(itemId)) {
      return res.status(400).json({
        success: false,
        message:
          'You already have access to this course through a previous purchase or bundle',
      });
    }

    // Initialize cart if not exists
    if (!req.session.cart) {
      req.session.cart = [];
    }

    // Check if item already in cart
    const existingItem = req.session.cart.find(
      (cartItem) => cartItem.id === itemId && cartItem.type === itemType
    );

    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: 'Item already in cart',
      });
    }

    // Check for bundle/course conflicts
    if (itemType === 'course') {
      // Check if this course is already in a bundle that's in the cart
      for (const cartItem of req.session.cart) {
        if (cartItem.type === 'bundle') {
          const bundle = await BundleCourse.findById(cartItem.id).populate(
            'courses'
          );
          if (
            bundle &&
            bundle.courses.some((course) => course._id.toString() === itemId)
          ) {
            return res.status(400).json({
              success: false,
              message: `This course is already included in the "${bundle.title}" bundle in your cart. Please remove the bundle first if you want to purchase this course individually.`,
            });
          }
        }
      }
    } else if (itemType === 'bundle') {
      // Check if any courses from this bundle are already in the cart individually
      const bundle = await BundleCourse.findById(itemId).populate('courses');
      if (bundle && bundle.courses) {
        const conflictingCourses = [];
        for (const course of bundle.courses) {
          const existingCourse = req.session.cart.find(
            (cartItem) =>
              cartItem.type === 'course' &&
              cartItem.id === course._id.toString()
          );
          if (existingCourse) {
            conflictingCourses.push(course.title);
          }
        }

        if (conflictingCourses.length > 0) {
          return res.status(400).json({
            success: false,
            message: `This bundle contains courses that are already in your cart: ${conflictingCourses.join(
              ', '
            )}. Please remove those individual courses first if you want to purchase the bundle.`,
          });
        }
      }
    }

    // Add item to cart (using database values only)
    const originalPrice = item.price || 0;
    const discountPercentage = item.discountPrice || 0;
    let finalPrice = originalPrice;

    if (discountPercentage > 0) {
      finalPrice = originalPrice - originalPrice * (discountPercentage / 100);
    }

    const cartItem = {
      id: itemId,
      type: itemType,
      title: item.title,
      originalPrice: originalPrice,
      discountPrice: discountPercentage,
      price: finalPrice, // Final price after discount
      image: item.thumbnail || '/images/adad.png',
      addedAt: new Date(),
    };

    req.session.cart.push(cartItem);

    res.json({
      success: true,
      message: 'Item added to cart successfully',
      cartCount: req.session.cart.length,
    });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding item to cart',
    });
  }
};

// Remove item from cart
const removeFromCart = async (req, res) => {
  try {
    const { itemId, itemType } = req.body;

    if (!req.session.cart) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
      });
    }

    req.session.cart = req.session.cart.filter(
      (item) => !(item.id === itemId && item.type === itemType)
    );

    res.json({
      success: true,
      message: 'Item removed from cart',
      cartCount: req.session.cart.length,
    });
  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing item from cart',
    });
  }
};

// Update cart item quantity
const updateCartQuantity = async (req, res) => {
  try {
    const { itemId, itemType, quantity } = req.body;

    if (!req.session.cart) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
      });
    }

    const item = req.session.cart.find(
      (cartItem) => cartItem.id === itemId && cartItem.type === itemType
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart',
      });
    }

    if (quantity <= 0) {
      req.session.cart = req.session.cart.filter(
        (cartItem) => !(cartItem.id === itemId && cartItem.type === itemType)
      );
    } else {
      item.quantity = Math.min(quantity, 1); // Max quantity is 1
    }

    // Calculate totals
    const subtotal = req.session.cart.reduce(
      (sum, item) => sum + item.price,
      0
    );
    const tax = 0; // No tax
    const total = subtotal + tax;

    res.json({
      success: true,
      message: 'Cart updated successfully',
      cartCount: req.session.cart.length,
      subtotal,
      tax,
      total,
    });
  } catch (error) {
    console.error('Error updating cart:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating cart',
    });
  }
};

// Get checkout page
const getCheckout = async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login to proceed to checkout');
      return res.redirect('/auth/login');
    }

    // Use validated cart data from middleware
    const validatedCart = req.validatedCart;

    if (validatedCart.cartCount === 0) {
      req.flash('error_msg', 'Your cart is empty or contains invalid items');
      return res.redirect('/');
    }

    res.render('checkout', {
      title: 'Checkout | ELKABLY',
      theme: req.cookies.theme || 'light',
      cart: validatedCart.items,
      subtotal: validatedCart.subtotal,
      tax: validatedCart.tax,
      total: validatedCart.total,
      user: req.session.user,
    });
  } catch (error) {
    console.error('Error fetching checkout:', error);
    req.flash('error_msg', 'Error loading checkout page');
    res.redirect('/');
  }
};

// Direct checkout (skip checkout page, go straight to order summary)
const directCheckout = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'Please login to complete purchase',
      });
    }

    // Use validated cart data from middleware
    const validatedCart = req.validatedCart;

    if (validatedCart.cartCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty or contains invalid items',
      });
    }

    const { paymentMethod = 'credit_card', billingAddress } = req.body;

    // Use default billing address if not provided
    const defaultBillingAddress = {
      firstName: req.session.user.firstName || 'Default',
      lastName: req.session.user.lastName || 'User',
      email: req.session.user.studentEmail || req.session.user.email,
      phone: `${req.session.user.parentCountryCode || '+966'}${
        req.session.user.parentNumber || '123456789'
      }`,
      address: 'Default Address',
      city: 'Riyadh',
      state: 'Riyadh',
      zipCode: '12345',
      country: 'Saudi Arabia',
    };

    const finalBillingAddress = billingAddress || defaultBillingAddress;

    // Get user from database
    const user = await User.findById(req.session.user.id)
      .populate('purchasedBundles.bundle')
      .populate('purchasedCourses.course')
      .populate('enrolledCourses.course');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Create purchase record using validated cart data
    const purchase = new Purchase({
      user: user._id,
      items: validatedCart.items.map((item) => ({
        itemType: item.type,
        itemTypeModel: item.type === 'bundle' ? 'BundleCourse' : 'Course',
        item: item.id,
        title: item.title,
        price: item.price, // Database-validated price
        quantity: 1,
      })),
      subtotal: validatedCart.subtotal,
      tax: validatedCart.tax,
      total: validatedCart.total,
      paymentMethod,
      billingAddress: finalBillingAddress,
      status: 'completed',
      paymentStatus: 'completed',
      paymentIntentId: `pi_${Date.now()}`,
    });

    console.log('Creating purchase record:', purchase);

    try {
      await purchase.save();
      console.log(
        'Purchase saved successfully with order number:',
        purchase.orderNumber
      );
    } catch (saveError) {
      console.error('Error saving purchase:', saveError);
      throw saveError;
    }

    // Refresh the purchase to get the generated orderNumber
    await purchase.populate('items.item');

    // Update user's purchased items and enrollments
    for (const item of validatedCart.items) {
      if (item.type === 'bundle') {
        await user.addPurchasedBundle(
          item.id,
          item.price, // Database-validated price
          purchase.orderNumber
        );

        // Enroll user in all courses in the bundle
        const bundle = await BundleCourse.findById(item.id).populate('courses');
        await user.enrollInBundleCourses(bundle);
      } else {
        await user.addPurchasedCourse(
          item.id,
          item.price, // Database-validated price
          purchase.orderNumber
        );

        // Enroll user in the course
        if (!user.isEnrolled(item.id)) {
          user.enrolledCourses.push({
            course: item.id,
            enrolledAt: new Date(),
            progress: 0,
            lastAccessed: new Date(),
            completedTopics: [],
            status: 'active',
          });
          await user.save();
        }
      }
    }

    // Clear cart
    const clearedCount = clearCart(req, 'direct checkout');

    // Send WhatsApp notification for direct checkout
    try {
      console.log('📱 Sending WhatsApp notification for direct checkout:', purchase.orderNumber);
      await whatsappNotificationService.sendPurchaseInvoiceNotification(
        user._id,
        purchase
      );
      
      // Mark WhatsApp notification as sent
      purchase.whatsappNotificationSent = true;
      await purchase.save();
      console.log('✅ WhatsApp notification sent for direct checkout');
    } catch (whatsappError) {
      console.error('❌ WhatsApp notification error for direct checkout:', whatsappError);
      // Don't fail the direct checkout if WhatsApp fails
    }

    res.json({
      success: true,
      message: 'Payment processed successfully',
      purchase: {
        orderNumber: purchase.orderNumber,
        items: validatedCart.items.map((item) => ({
          ...item,
          type: item.type,
        })),
        subtotal: validatedCart.subtotal,
        tax: validatedCart.tax,
        total: validatedCart.total,
      },
      cartCleared: true,
      itemsRemoved: clearedCount,
    });
  } catch (error) {
    console.error('Error processing direct checkout:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing payment',
    });
  }
};

// Process payment and create order
const processPayment = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'Please login to complete purchase',
      });
    }

    // Use validated cart data from middleware
    const validatedCart = req.validatedCart;

    if (validatedCart.cartCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty or contains invalid items',
      });
    }

    // Check if user already purchased any of the items in cart
    const user = await User.findById(req.session.user.id);
    const alreadyPurchasedItems = [];

    for (const item of validatedCart.items) {
      if (item.type === 'bundle' && user.hasPurchasedBundle(item.id)) {
        alreadyPurchasedItems.push(`${item.title} (bundle)`);
      } else if (item.type === 'course' && user.hasAccessToCourse(item.id)) {
        alreadyPurchasedItems.push(`${item.title} (course)`);
      }
    }

    if (alreadyPurchasedItems.length > 0) {
      return res.status(400).json({
        success: false,
        message: `You already have access to: ${alreadyPurchasedItems.join(', ')}. Please remove these items from your cart.`,
      });
    }

    const { paymentMethod = 'paymob', billingAddress } = req.body;

    // Validate billing address
    const requiredFields = [
      'firstName',
      'lastName',
      'email',
      'phone',
      'address',
      'city',
      'state',
      'zipCode',
      'country',
    ];
    for (const field of requiredFields) {
      if (!billingAddress[field]) {
        return res.status(400).json({
          success: false,
          message: `${field} is required`,
        });
      }
    }

    // Generate unique merchant order ID
    const merchantOrderId = generateUUID();

    // Handle promo code if applied - SECURITY: Always recalculate from server
    let finalSubtotal = validatedCart.subtotal;
    let finalTax = validatedCart.tax;
    let finalTotal = validatedCart.total;
    let appliedPromoCode = null;
    let discountAmount = 0;

    if (req.session.appliedPromoCode) {
      // SECURITY: Re-validate promo code and recalculate amounts from server
      const promoValidation = await validateAndApplyPromoCode(
        req.session.appliedPromoCode.code,
        req.session.user.id,
        validatedCart.items,
        validatedCart.subtotal,
        req.session.user.email || req.session.user.studentEmail
      );

      if (promoValidation.success) {
        appliedPromoCode = promoValidation.promoCode;
        discountAmount = promoValidation.discountAmount;
        finalSubtotal = validatedCart.subtotal; // Keep original subtotal
        finalTax = validatedCart.tax; // Keep original tax
        finalTotal = promoValidation.finalAmount; // Use server-calculated final amount
        
        // SECURITY: Validate that session promo code data matches server calculation
        const sessionDiscount = req.session.appliedPromoCode.discountAmount || 0;
        const sessionFinal = req.session.appliedPromoCode.finalAmount || 0;
        
        if (Math.abs(sessionDiscount - discountAmount) > 0.01 || 
            Math.abs(sessionFinal - finalTotal) > 0.01) {
          console.warn('Promo code session data mismatch, using server calculation:', {
            sessionDiscount,
            serverDiscount: discountAmount,
            sessionFinal,
            serverFinal: finalTotal
          });
        }
        
        console.log('Promo code applied successfully:', {
          originalAmount: validatedCart.subtotal,
          discountAmount: discountAmount,
          finalAmount: finalTotal,
          promoCode: appliedPromoCode.code
        });
      } else {
        // Remove invalid promo code from session
        delete req.session.appliedPromoCode;
        return res.status(400).json({
          success: false,
          message: `Promo code is no longer valid: ${promoValidation.error}`
        });
      }
    }

    // Create purchase record with pending status using validated cart data
    const purchase = new Purchase({
      user: req.session.user.id,
      items: validatedCart.items.map((item) => ({
        itemType: item.type,
        itemTypeModel: item.type === 'bundle' ? 'BundleCourse' : 'Course',
        item: item.id,
        title: item.title,
        price: item.price, // Database-validated price
        quantity: 1,
      })),
      subtotal: finalSubtotal,
      tax: finalTax,
      total: finalTotal,
      currency: 'EGP',
      paymentMethod: 'paymob',
      billingAddress,
      status: 'pending',
      paymentStatus: 'pending',
      paymentIntentId: merchantOrderId,
      // Add promo code information
      appliedPromoCode: appliedPromoCode ? appliedPromoCode._id : null,
      discountAmount: discountAmount,
      originalAmount: validatedCart.subtotal,
      promoCodeUsed: appliedPromoCode ? appliedPromoCode.code : null,
    });

    await purchase.save();

    // Create Paymob payment session using validated data
    const orderData = {
      total: finalTotal, // Use final total after promo code discount
      merchantOrderId,
      items: validatedCart.items.map((item) => ({
        title: item.title,
        price: item.price, // Database-validated price
        quantity: 1,
        description: `${item.type === 'bundle' ? 'Bundle' : 'Course'}: ${
          item.title
        }`,
      })),
    };

    // Log payment data for debugging
    console.log('Creating payment session with data:', {
      originalSubtotal: validatedCart.subtotal,
      finalTotal: finalTotal,
      discountAmount: discountAmount,
      promoCode: appliedPromoCode ? appliedPromoCode.code : 'none',
      merchantOrderId: merchantOrderId
    });

    // Add redirect URL to billing address for Paymob iframe
    const enhancedBillingAddress = {
      ...billingAddress,
      redirectUrl: `${req.protocol}://${req.get(
        'host'
      )}/purchase/payment/success?merchantOrderId=${merchantOrderId}`,
    };

    const paymentSession = await paymobService.createPaymentSession(
      orderData,
      enhancedBillingAddress,
      req.body.selectedPaymentMethod || 'card' // 'card' or 'wallet'
    );

    if (!paymentSession.success) {
      // Update purchase status to failed
      purchase.status = 'failed';
      purchase.paymentStatus = 'failed';
      await purchase.save();

      return res.status(500).json({
        success: false,
        message: paymentSession.error || 'Failed to create payment session',
      });
    }

    // Store purchase order number for webhook verification
    req.session.pendingPayment = {
      purchaseId: purchase._id.toString(),
      orderNumber: purchase.orderNumber,
      merchantOrderId,
    };

    res.json({
      success: true,
      message: 'Payment session created successfully',
      paymentData: {
        iframeUrl: paymentSession.iframeUrl,
        orderNumber: purchase.orderNumber,
        total: finalTotal, // Use the final total after promo code discount
        currency: 'EGP',
      },
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing payment',
    });
  }
};

// Note: Order summary is now shown directly on checkout page

// Get user's purchase history
const getPurchaseHistory = async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login to view purchase history');
      return res.redirect('/auth/login');
    }

    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const purchases = await Purchase.find({ user: req.session.user.id })
      .populate('items.item')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalPurchases = await Purchase.countDocuments({
      user: req.session.user.id,
    });
    const totalPages = Math.ceil(totalPurchases / parseInt(limit));

    res.render('purchase-history', {
      title: 'Purchase History | ELKABLY',
      theme: req.cookies.theme || 'light',
      purchases,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalPurchases,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
      user: req.session.user,
    });
  } catch (error) {
    console.error('Error fetching purchase history:', error);
    req.flash('error_msg', 'Error loading purchase history');
    res.redirect('/');
  }
};

// Add item to wishlist
const addToWishlist = async (req, res) => {
  try {
    const { itemId, itemType } = req.body;

    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'Please login to add items to wishlist',
      });
    }

    // Validate item exists
    let item;
    if (itemType === 'bundle') {
      item = await BundleCourse.findById(itemId);
    } else {
      item = await Course.findById(itemId);
    }

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found',
      });
    }

    // Get user from database
    const user = await User.findById(req.session.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Add to wishlist
    if (itemType === 'bundle') {
      if (user.isBundleInWishlist(itemId)) {
        return res.status(400).json({
          success: false,
          message: 'Bundle already in wishlist',
        });
      }
      await user.addBundleToWishlist(itemId);
    } else {
      if (user.isCourseInWishlist(itemId)) {
        return res.status(400).json({
          success: false,
          message: 'Course already in wishlist',
        });
      }
      await user.addCourseToWishlist(itemId);
    }

    res.json({
      success: true,
      message: `${
        itemType === 'bundle' ? 'Bundle' : 'Course'
      } added to wishlist successfully`,
    });
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding item to wishlist',
    });
  }
};

// Remove item from wishlist
const removeFromWishlist = async (req, res) => {
  try {
    const { itemId, itemType } = req.body;

    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'Please login to remove items from wishlist',
      });
    }

    // Get user from database
    const user = await User.findById(req.session.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Remove from wishlist
    if (itemType === 'bundle') {
      if (!user.isBundleInWishlist(itemId)) {
        return res.status(400).json({
          success: false,
          message: 'Bundle not in wishlist',
        });
      }
      await user.removeBundleFromWishlist(itemId);
    } else {
      if (!user.isCourseInWishlist(itemId)) {
        return res.status(400).json({
          success: false,
          message: 'Course not in wishlist',
        });
      }
      await user.removeCourseFromWishlist(itemId);
    }

    res.json({
      success: true,
      message: `${
        itemType === 'bundle' ? 'Bundle' : 'Course'
      } removed from wishlist successfully`,
    });
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing item from wishlist',
    });
  }
};

// Toggle wishlist status
const toggleWishlist = async (req, res) => {
  try {
    const { itemId, itemType } = req.body;

    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'Please login to manage wishlist',
      });
    }

    // Get user from database
    const user = await User.findById(req.session.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    let isInWishlist = false;
    let message = '';

    // Toggle wishlist status
    if (itemType === 'bundle') {
      isInWishlist = user.isBundleInWishlist(itemId);
      if (isInWishlist) {
        await user.removeBundleFromWishlist(itemId);
        message = 'Bundle removed from wishlist';
      } else {
        await user.addBundleToWishlist(itemId);
        message = 'Bundle added to wishlist';
        isInWishlist = true;
      }
    } else {
      isInWishlist = user.isCourseInWishlist(itemId);
      if (isInWishlist) {
        await user.removeCourseFromWishlist(itemId);
        message = 'Course removed from wishlist';
      } else {
        await user.addCourseToWishlist(itemId);
        message = 'Course added to wishlist';
        isInWishlist = true;
      }
    }

    res.json({
      success: true,
      message,
      isInWishlist,
    });
  } catch (error) {
    console.error('Error toggling wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating wishlist',
    });
  }
};

// Handle payment success
const handlePaymentSuccess = async (req, res) => {
  try {
    // Handle both direct merchant order ID and Paymob redirect parameters
    let merchantOrderId =
      req.query.merchantOrderId || req.query.merchant_order_id;


    // If no merchant order ID in query, check if this is a Paymob redirect
    // Check for explicit failure indicators in URL parameters
    if (
      req.query.success === 'false' ||
      req.query.failure === 'true' ||
      req.query.status === 'failed' ||
      req.query.status === 'declined'
    ) {
      console.log('Payment failure detected in URL parameters:', req.query);
      return res.render('payment-fail', {
        title: 'Payment Failed | ELKABLY',
        theme: req.cookies.theme || 'light',
        message:
          'Payment was not successful. Please try again or contact support.',
      });
    }

    if (!merchantOrderId && req.query.success === 'true') {
      // This is a Paymob redirect, extract merchant order ID from the transaction
      merchantOrderId = req.query.merchant_order_id;
    }

    if (!merchantOrderId) {
      console.error('Payment success: No merchant order ID provided');
      return res.render('payment-fail', {
        title: 'Payment Error | ELKABLY',
        theme: req.cookies.theme || 'light',
        message: 'Invalid payment reference',
      });
    }

    // Find purchase by merchant order ID
    const purchase = await Purchase.findOne({
      paymentIntentId: merchantOrderId,
    })
      .populate('items.item')
      .populate('user');

    if (!purchase) {
      console.error('Payment success: Purchase not found');
      return res.render('payment-fail', {
        title: 'Payment Error | ELKABLY',
        theme: req.cookies.theme || 'light',
        message: 'Payment record not found',
      });
    }

    // Verify payment status with Paymob (optional additional verification)
    let paymentVerified = false;
    try {
      const transactionStatus = await paymobService.queryTransactionStatus(
        merchantOrderId
      );

      // Process the transaction status to determine if payment is truly successful
      if (transactionStatus) {
        const webhookData =
          paymobService.processWebhookPayload(transactionStatus);

        if (webhookData.isFailed) {
          return res.render('payment-fail', {
            title: 'Payment Failed | ELKABLY',
            theme: req.cookies.theme || 'light',
            message:
              'Payment was not successful. Please try again or contact support.',
          });
        }

        if (webhookData.isSuccess) {
          paymentVerified = true;
        }
      }
    } catch (verifyError) {
      console.warn('Could not verify transaction status:', verifyError.message);
    }

    // If purchase is marked as failed, show failure page
    if (purchase.status === 'failed' || purchase.paymentStatus === 'failed') {
      return res.render('payment-fail', {
        title: 'Payment Failed | ELKABLY',
        theme: req.cookies.theme || 'light',
        message:
          'Payment was not successful. Please try again or contact support.',
      });
    }

    // If already processed, just show success (no need to clear cart)
    if (
      purchase.status === 'completed' &&
      purchase.paymentStatus === 'completed'
    ) {

      // Only send WhatsApp notification if not already sent
      if (!purchase.whatsappNotificationSent) {
        try {
          console.log('📱 Sending WhatsApp notification for completed purchase:', purchase.orderNumber);
          await whatsappNotificationService.sendPurchaseInvoiceNotification(
            purchase.user._id,
            purchase
          );
          
          // Mark WhatsApp notification as sent
          purchase.whatsappNotificationSent = true;
          await purchase.save();
          console.log('✅ WhatsApp notification sent and marked as sent');
        } catch (whatsappError) {
          console.error('❌ WhatsApp notification error:', whatsappError);
          // Don't fail the payment success if WhatsApp fails
        }
      }

      return res.render('payment-success', {
        title: 'Payment Successful - Mr Kably',
        theme: req.cookies.theme || 'light',
        purchase: purchase.toObject(),
        user: purchase.user,
      });
    }

    // Update purchase status to completed
    purchase.status = 'completed';
    purchase.paymentStatus = 'completed';
    await purchase.save();

    // Get user and update enrollments
    const user = await User.findById(purchase.user._id)
      .populate('purchasedBundles.bundle')
      .populate('purchasedCourses.course')
      .populate('enrolledCourses.course');

    if (user) {
      // Process each purchased item
      for (const purchaseItem of purchase.items) {
        if (purchaseItem.itemType === 'bundle') {
          await user.addPurchasedBundle(
            purchaseItem.item._id,
            purchaseItem.price,
            purchase.orderNumber
          );

          // Enroll user in all courses in the bundle
          const bundle = await BundleCourse.findById(
            purchaseItem.item._id
          ).populate('courses');
          if (bundle) {
            await user.enrollInBundleCourses(bundle);
          }
        } else {
          await user.addPurchasedCourse(
            purchaseItem.item._id,
            purchaseItem.price,
            purchase.orderNumber
          );

          // Enroll user in the course using safe enrollment
          await user.safeEnrollInCourse(purchaseItem.item._id);
        }
      }

      // Handle promo code usage if applied
      if (purchase.appliedPromoCode && purchase.discountAmount > 0) {
        try {
          // Add promo code usage to user
          await user.addPromoCodeUsage(
            purchase.appliedPromoCode,
            purchase._id,
            purchase.discountAmount,
            purchase.originalAmount,
            purchase.total
          );

          // Update promo code usage count and history
          const promoCode = await PromoCode.findById(purchase.appliedPromoCode);
          if (promoCode) {
            // Add to usage history
            promoCode.usageHistory.push({
              user: purchase.user._id,
              purchase: purchase._id,
              discountAmount: purchase.discountAmount,
              originalAmount: purchase.originalAmount,
              finalAmount: purchase.total,
              usedAt: new Date()
            });
            
            // Increment current uses
            promoCode.currentUses += 1;
            
            // If this is a single-use bulk code, mark it as used
            if (promoCode.isSingleUseOnly) {
              promoCode.usedByStudent = purchase.user._id;
              const userEmail = user.studentEmail || user.email;
              if (userEmail) {
                promoCode.usedByStudentEmail = userEmail.toLowerCase();
              }
            }
            
            await promoCode.save();
            
          }
        } catch (error) {
          console.error('Error tracking promo code usage:', error);
        }
      }
    }


    // Clear the cart after successful payment
    clearCart(req, 'payment success page');

    // Send WhatsApp notification to parent with invoice
    try {
      console.log('📱 Sending WhatsApp notification for new purchase:', purchase.orderNumber);
      await whatsappNotificationService.sendPurchaseInvoiceNotification(
        purchase.user._id,
        purchase
      );
      
      // Mark WhatsApp notification as sent
      purchase.whatsappNotificationSent = true;
      await purchase.save();
      console.log('✅ WhatsApp notification sent and marked as sent');
    } catch (whatsappError) {
      console.error('❌ WhatsApp notification error:', whatsappError);
      // Don't fail the payment success if WhatsApp fails
    }

    res.render('payment-success', {
      title: 'Payment Successful - Mr Kably',
      theme: req.cookies.theme || 'light',
      purchase: purchase.toObject(),
      user: purchase.user,
    });
  } catch (error) {
    console.error('Error handling payment success:', error);
    
    // Clear cart on error in payment success handler
    clearCart(req, 'payment success error');
    
    res.render('payment-fail', {
      title: 'Payment Error - Mr Kably',
      theme: req.cookies.theme || 'light',
      message: 'An error occurred while processing your payment',
    });
  }
};

// Handle payment failure
const handlePaymentFailure = async (req, res) => {
  try {
    const { merchantOrderId } = req.query;

    if (merchantOrderId) {
      // Update purchase status to failed
      const purchase = await Purchase.findOne({
        paymentIntentId: merchantOrderId,
      });
      if (purchase && purchase.status === 'pending') {
        purchase.status = 'failed';
        purchase.paymentStatus = 'failed';
        await purchase.save();
        console.log('Payment failed for order:', purchase.orderNumber);
      }
    }

    // Clear the cart after failed payment
    clearCart(req, 'payment failed');

    res.render('payment-fail', {
      title: 'Payment Failed - Mr Kably',
      theme: req.cookies.theme || 'light',
      message:
        'Your payment could not be processed. Please try again or contact support.',
    });
  } catch (error) {
    console.error('Error handling payment failure:', error);
    
    // Clear cart even on error
    clearCart(req, 'payment error');
    
    res.render('payment-fail', {
      title: 'Payment Error - Mr Kably',
      theme: req.cookies.theme || 'light',
      message: 'An error occurred while processing your payment',
    });
  }
};

// Handle Paymob webhook
const handlePaymobWebhook = async (req, res) => {
  try {
    const rawBody = req.body;
    const signature =
      req.headers['x-paymob-signature'] ||
      req.headers['x-signature'] ||
      req.headers['x-hook-signature'] ||
      req.headers['x-paymob-hmac'];

    // Verify webhook signature in production
    if (process.env.NODE_ENV === 'production') {
      const isValid = paymobService.verifyWebhookSignature(rawBody, signature);
      if (!isValid) {
        console.warn('Webhook signature verification failed');
        return res.status(401).send('Unauthorized');
      }
    }

    const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;

    // Process webhook payload with query parameters (for comprehensive detection like standalone app)
    const webhookData = paymobService.processWebhookPayload(payload, req.query);

    if (!webhookData.merchantOrderId) {
      return res.status(400).send('Bad Request');
    }

    // Find purchase by merchant order ID
    const purchase = await Purchase.findOne({
      paymentIntentId: webhookData.merchantOrderId,
    }).populate('user');

    if (!purchase) {
      return res.status(404).send('Purchase not found');
    }

    // Only process if current status is pending
    if (purchase.status !== 'pending') {
      return res.status(200).send('OK');
    }

    if (webhookData.isSuccess) {

      // Update purchase status
      purchase.status = 'completed';
      purchase.paymentStatus = 'completed';
      purchase.paymentGatewayResponse = webhookData.rawPayload;
      await purchase.save();

      // Process user enrollments
      const user = await User.findById(purchase.user._id)
        .populate('purchasedBundles.bundle')
        .populate('purchasedCourses.course')
        .populate('enrolledCourses.course');

      if (user) {
        for (const purchaseItem of purchase.items) {
          if (purchaseItem.itemType === 'bundle') {
            await user.addPurchasedBundle(
              purchaseItem.item,
              purchaseItem.price,
              purchase.orderNumber
            );

            const bundle = await BundleCourse.findById(
              purchaseItem.item
            ).populate('courses');
            if (bundle) {
              await user.enrollInBundleCourses(bundle);
            }
          } else {
            await user.addPurchasedCourse(
              purchaseItem.item,
              purchaseItem.price,
              purchase.orderNumber
            );

            if (!user.isEnrolled(purchaseItem.item)) {
              user.enrolledCourses.push({
                course: purchaseItem.item,
                enrolledAt: new Date(),
                progress: 0,
                lastAccessed: new Date(),
                completedTopics: [],
                status: 'active',
              });
              await user.save();
            }
          }
        }

        // Handle promo code usage if applied
        if (purchase.appliedPromoCode && purchase.discountAmount > 0) {
          try {
            // Add promo code usage to user
            await user.addPromoCodeUsage(
              purchase.appliedPromoCode,
              purchase._id,
              purchase.discountAmount,
              purchase.originalAmount,
              purchase.total
            );

            // Update promo code usage count and history
            const promoCode = await PromoCode.findById(purchase.appliedPromoCode);
            if (promoCode) {
              // Add to usage history
              promoCode.usageHistory.push({
                user: purchase.user._id,
                purchase: purchase._id,
                discountAmount: purchase.discountAmount,
                originalAmount: purchase.originalAmount,
                finalAmount: purchase.total,
                usedAt: new Date()
              });
              
              // Increment current uses
              promoCode.currentUses += 1;
              await promoCode.save();
              
              console.log('Promo code usage tracked:', {
                code: promoCode.code,
                user: purchase.user._id,
                purchase: purchase._id,
                discountAmount: purchase.discountAmount
              });
            }
          } catch (error) {
            console.error('Error tracking promo code usage:', error);
          }
        }
      }

      // Send WhatsApp notification for successful webhook payment
      // try {
      //   console.log(`[Webhook] Starting WhatsApp notification for webhook payment: ${purchase.orderNumber}`);
      //   console.log(`[Webhook] User ID: ${purchase.user._id}`);
        
      //   const invoiceUrl = await whatsappNotificationService.generateAndUploadInvoice(purchase);
      //   console.log(`[Webhook] Invoice URL generated: ${invoiceUrl}`);
        
      //   const whatsappResult = await whatsappNotificationService.sendPurchaseInvoiceNotification(
      //     purchase.user._id,
      //     purchase,
      //     invoiceUrl
      //   );
        
      //   if (whatsappResult.success) {
      //     console.log(`[Webhook] ✅ WhatsApp notification sent successfully for webhook payment: ${purchase.orderNumber}`);
      //   } else {
      //     console.error(`[Webhook] ❌ WhatsApp notification failed for webhook payment: ${purchase.orderNumber}`);
      //     console.error(`[Webhook] ❌ WhatsApp error:`, whatsappResult.message);
      //   }
      // } catch (whatsappError) {
      //   console.error(`[Webhook] ❌ WhatsApp notification exception for webhook payment: ${purchase.orderNumber}`, whatsappError);
      //   // Don't fail the webhook if WhatsApp fails
      // }
    } else if (webhookData.isFailed) {

      purchase.status = 'failed';
      purchase.paymentStatus = 'failed';
      purchase.paymentGatewayResponse = webhookData.rawPayload;
      await purchase.save();
    } else {
      // Keep as pending for now
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing Paymob webhook:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Handle Paymob webhook GET redirects (browser callbacks)
const handlePaymobWebhookRedirect = async (req, res) => {
  try {
    console.log('Paymob webhook redirect received with query:', req.query);

    const merchantOrderId =
      req.query.merchant_order_id ||
      req.query.merchantOrder ||
      req.query.merchantOrderId;

    if (!merchantOrderId) {
      console.warn('Webhook redirect: No merchant order ID found in query');
      return res.redirect('/purchase/payment/fail?reason=missing_order_id');
    }

    // Find purchase by merchant order ID
    const purchase = await Purchase.findOne({
      paymentIntentId: merchantOrderId,
    }).populate('user');

    if (!purchase) {
      console.warn(
        'Webhook redirect: Purchase not found for merchant order ID:',
        merchantOrderId
      );
      return res.redirect('/purchase/payment/fail?reason=order_not_found');
    }

    // Process query parameters using enhanced detection logic
    const webhookData = paymobService.processWebhookPayload({}, req.query);

    console.log('Webhook redirect analysis:', {
      merchantOrderId,
      isSuccess: webhookData.isSuccess,
      isFailed: webhookData.isFailed,
      isPending: webhookData.isPending,
      query: req.query,
    });

    // Only process if current status is pending
    if (purchase.status !== 'pending') {
      console.log(
        'Webhook redirect: Purchase already processed, redirecting to appropriate page:',
        purchase.orderNumber,
        'Status:',
        purchase.status
      );

      if (purchase.status === 'completed') {
        return res.redirect(
          `/purchase/payment/success?merchantOrderId=${merchantOrderId}`
        );
      } else {
        return res.redirect('/purchase/payment/fail?reason=payment_failed');
      }
    }

    if (webhookData.isSuccess) {
      console.log(
        'Webhook redirect: Payment successful for order:',
        purchase.orderNumber
      );

      // Update purchase status
      purchase.status = 'completed';
      purchase.paymentStatus = 'completed';
      purchase.paymentGatewayResponse = { queryParams: req.query };
      await purchase.save();

      // Process user enrollments (same logic as webhook)
      const user = await User.findById(purchase.user._id)
        .populate('purchasedBundles.bundle')
        .populate('purchasedCourses.course')
        .populate('enrolledCourses.course');

      if (user) {
        for (const purchaseItem of purchase.items) {
          if (purchaseItem.itemType === 'bundle') {
            await user.addPurchasedBundle(
              purchaseItem.item,
              purchaseItem.price,
              purchase.orderNumber
            );

            const bundle = await BundleCourse.findById(
              purchaseItem.item
            ).populate('courses');
            if (bundle) {
              await user.enrollInBundleCourses(bundle);
            }
          } else {
            await user.addPurchasedCourse(
              purchaseItem.item,
              purchaseItem.price,
              purchase.orderNumber
            );

            if (!user.isEnrolled(purchaseItem.item)) {
              user.enrolledCourses.push({
                course: purchaseItem.item,
                enrolledAt: new Date(),
                progress: 0,
                lastAccessed: new Date(),
                completedTopics: [],
                status: 'active',
              });
              await user.save();
            }
          }
        }

        // Handle promo code usage if applied
        if (purchase.appliedPromoCode && purchase.discountAmount > 0) {
          try {
            // Add promo code usage to user
            await user.addPromoCodeUsage(
              purchase.appliedPromoCode,
              purchase._id,
              purchase.discountAmount,
              purchase.originalAmount,
              purchase.total
            );

            // Update promo code usage count and history
            const promoCode = await PromoCode.findById(purchase.appliedPromoCode);
            if (promoCode) {
              // Add to usage history
              promoCode.usageHistory.push({
                user: purchase.user._id,
                purchase: purchase._id,
                discountAmount: purchase.discountAmount,
                originalAmount: purchase.originalAmount,
                finalAmount: purchase.total,
                usedAt: new Date()
              });
              
              // Increment current uses
              promoCode.currentUses += 1;
              await promoCode.save();
              
              console.log('Promo code usage tracked:', {
                code: promoCode.code,
                user: purchase.user._id,
                purchase: purchase._id,
                discountAmount: purchase.discountAmount
              });
            }
          } catch (error) {
            console.error('Error tracking promo code usage:', error);
          }
        }
      }

      // Clear the cart after successful payment (webhook redirect)
      clearCart(req, 'webhook redirect success');

      return res.redirect(
        `/purchase/payment/success?merchantOrderId=${merchantOrderId}`
      );
    } else if (webhookData.isFailed) {
      console.log(
        'Webhook redirect: Payment failed for order:',
        purchase.orderNumber
      );

      purchase.status = 'failed';
      purchase.paymentStatus = 'failed';
      purchase.paymentGatewayResponse = { queryParams: req.query };
      await purchase.save();

      const reason =
        req.query['data.message'] ||
        req.query.message ||
        req.query.reason ||
        req.query.error ||
        req.query.acq_response_code ||
        'payment_failed';
      return res.redirect(
        `/purchase/payment/fail?reason=${encodeURIComponent(reason)}`
      );
    } else {
      console.log(
        'Webhook redirect: Payment status pending/unknown for order:',
        purchase.orderNumber
      );
      // Keep as pending and redirect to a pending page or retry
      return res.redirect('/purchase/payment/fail?reason=payment_pending');
    }
  } catch (error) {
    console.error('Error processing Paymob webhook redirect:', error);
    return res.redirect('/purchase/payment/fail?reason=processing_error');
  }
};

module.exports = {
  getCart,
  clearCartAPI,
  addToCart,
  removeFromCart,
  getCheckout,
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
  recalculateCartFromDB,
  // Promo Code Management
  validatePromoCode,
  removePromoCode,
  clearInvalidPromoCode,
};
