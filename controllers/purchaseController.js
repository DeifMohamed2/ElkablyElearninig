const Purchase = require('../models/Purchase');
const User = require('../models/User');
const BundleCourse = require('../models/BundleCourse');
const Course = require('../models/Course');
const PromoCode = require('../models/PromoCode');
const BookOrder = require('../models/BookOrder');
const crypto = require('crypto');
const paymobService = require('../utils/paymobService');
const whatsappSMSNotificationService = require('../utils/whatsappSMSNotificationService');
const wasender = require('../utils/wasender');

// Simple UUID v4 generator
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Helper function to get the effective starting order for a student in a bundle
async function getStudentStartingOrderInBundle(userId, bundleId) {
  try {
    const user = await User.findById(userId);
    if (!user) return null;

    const bundleCourses = await Course.find({ bundle: bundleId })
      .select('_id order')
      .sort({ order: 1 });

    let bundleStartingOrder = null;
    for (const bundleCourse of bundleCourses) {
      const enrollment = user.enrolledCourses.find(
        (e) => e.course && e.course.toString() === bundleCourse._id.toString()
      );
      if (enrollment && enrollment.startingOrder !== null && enrollment.startingOrder !== undefined) {
        // Use the minimum startingOrder found in the bundle
        if (bundleStartingOrder === null || enrollment.startingOrder < bundleStartingOrder) {
          bundleStartingOrder = enrollment.startingOrder;
        }
      }
    }

    return bundleStartingOrder;
  } catch (error) {
    console.error('Error getting student starting order:', error);
    return null;
  }
}

// Helper function to send WhatsApp notification to library for book orders
async function sendLibraryBookOrderNotification(bookOrders, user) {
  try {
    if (!bookOrders || bookOrders.length === 0) {
      return { success: false, message: 'No book orders to notify' };
    }

    // Convert to array if single object
    const bookOrdersArray = Array.isArray(bookOrders) ? bookOrders : [bookOrders];
    
    // Check if any book order already has notification sent
    const BookOrder = require('../models/BookOrder');
    const bookOrderIds = bookOrdersArray.map(bo => {
      // Handle both ObjectId and string IDs, and handle lean objects
      if (typeof bo === 'string') return bo;
      if (bo._id) {
        return typeof bo._id === 'string' ? bo._id : bo._id.toString();
      }
      return bo.toString();
    });
    
    const existingOrders = await BookOrder.find({ _id: { $in: bookOrderIds } })
      .populate('bundle', 'title bundleCode');
    
    // Filter out orders that already have notification sent
    const ordersToNotify = existingOrders.filter(order => !order.libraryNotificationSent);
    
    if (ordersToNotify.length === 0) {
      console.log('📚 All book orders already have library notifications sent, skipping...');
      return { success: true, message: 'All notifications already sent', skipped: true };
    }
    
    // Use the first order's data for message formatting (but send notification for all)
    const firstBookOrder = ordersToNotify[0];

    // Get session API key
    const SESSION_API_KEY = process.env.WASENDER_SESSION_API_KEY || process.env.WHATSAPP_SESSION_API_KEY || '';
    if (!SESSION_API_KEY) {
      console.error('❌ WhatsApp session API key not configured');
      return { success: false, message: 'WhatsApp session API key not configured' };
    }

    // Determine library phone number based on country
    // Check the first book order's shipping address country
    const country = firstBookOrder.shippingAddress?.country || '';
    const isEgypt = country.toLowerCase().includes('egypt') || country.toLowerCase().includes('مصر') || country === 'EG' || country === 'Egypt';
    
    // Library phone numbers (local Egyptian format, will be converted to international format)
    const egyptLibraryPhone = '01023680795'; // Egypt library
    const internationalLibraryPhone = '01211000260'; // International library
    const libraryPhone = isEgypt ? egyptLibraryPhone : internationalLibraryPhone;

    // Format phone number for WhatsApp (ensure it has country code format)
    const formatPhoneForWhatsApp = (phone) => {
      // Remove all non-digit characters
      const cleaned = phone.replace(/\D/g, '');
      // If starts with 0, replace with country code 20 (Egypt)
      if (cleaned.startsWith('0')) {
        return `20${cleaned.substring(1)}`;
      }
      // If doesn't start with country code, add 20 (default to Egypt format)
      if (!cleaned.startsWith('20') && !cleaned.startsWith('+')) {
        return `20${cleaned}`;
      }
      return cleaned.replace(/^\+/, ''); // Remove + if present
    };

    const formattedLibraryPhone = formatPhoneForWhatsApp(libraryPhone);
    const libraryJid = `${formattedLibraryPhone}@s.whatsapp.net`;

    // Format professional Arabic message
    let message = '📚 *طلب جديد*\n\n';
    message += '═══════════════════\n\n';
    
    // Add order details for each book
    for (const bookOrder of ordersToNotify) {
      message += `*رقم الطلب:* ${bookOrder.orderNumber || 'N/A'}\n`;
      message += `*معرف الطلب:* ${bookOrder._id}\n`;
      message += `*اسم الكتاب:* ${bookOrder.bookName || 'N/A'}\n`;
      message += `*اسم الكورس:* ${bookOrder.bundle?.title || 'N/A'}\n`;
      message += `*سعر الكتاب:* ${bookOrder.bookPrice || 0} جنيه\n\n`;
    }

    // Add shipping address details (use first order's address)
    if (firstBookOrder.shippingAddress) {
      const address = firstBookOrder.shippingAddress;
      message += '*عنوان الشحن:*\n';
      message += `*الاسم:* ${address.firstName || ''} ${address.lastName || ''}\n`;
      message += `*رقم الهاتف:* ${address.phone || 'N/A'}\n`;
      message += `*العنوان:* ${address.address || 'N/A'}\n`;
      message += `*المدينة:* ${address.city || 'N/A'}\n`;
      message += `*المحافظة:* ${address.state || 'N/A'}\n`;
      message += `*البلد:* ${address.country || 'N/A'}\n\n`;
    }

    // Add student and parent contact information
    if (user) {
      message += '*معلومات الطالب والوالد:*\n';
      message += `*اسم الطالب:* ${user.firstName || ''} ${user.lastName || ''}\n`;
      message += `*رقم هاتف الطالب:* ${user.studentCountryCode || ''}${user.studentNumber || 'N/A'}\n`;
      message += `*رقم هاتف الوالد:* ${user.parentCountryCode || ''}${user.parentNumber || 'N/A'}\n`;
    }

    message += '═══════════════════\n';
    message += `*التاريخ:* ${new Date().toLocaleDateString('ar-EG', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}\n`;

    // Send WhatsApp message
    console.log(`📱 Sending book order notification to library (${isEgypt ? 'Egypt' : 'International'}): ${libraryJid}`);
    const result = await wasender.sendTextMessage(SESSION_API_KEY, libraryJid, message);

    if (result.success) {
      console.log(`✅ Library notification sent successfully to ${isEgypt ? 'Egypt' : 'International'} library`);
      
      // Mark all orders as notification sent
      for (const order of ordersToNotify) {
        order.libraryNotificationSent = true;
        order.libraryNotificationSentAt = new Date();
        await order.save();
      }
      
      return { success: true, message: 'Library notification sent successfully', libraryPhone: formattedLibraryPhone };
    } else {
      console.error('❌ Failed to send library notification:', result.message);
      return { success: false, message: result.message || 'Failed to send library notification' };
    }
  } catch (error) {
    console.error('❌ Error sending library book order notification:', error);
    return { success: false, message: error.message || 'Error sending library notification' };
  }
}

// Helper function to validate course ordering when adding to cart
async function validateCourseOrdering(courseId, userId, cartItems = []) {
  try {
    const course = await Course.findById(courseId).select('order bundle requiresSequential');
    if (!course) {
      return { valid: false, message: 'Course not found' };
    }

    // If sequential requirement is disabled, allow any order
    if (!course.requiresSequential) {
      return { valid: true };
    }

    // Get all courses in the same bundle, sorted by order
    const bundleCourses = await Course.find({ bundle: course.bundle })
      .select('_id title order')
      .sort({ order: 1 });

    // Find current course index
    const currentIndex = bundleCourses.findIndex(
      (c) => c._id.toString() === courseId.toString()
    );

    // First course (order 0 or lowest order) is always valid
    if (currentIndex === 0) {
      return { valid: true };
    }

    // Get user's purchased courses
    const user = await User.findById(userId)
      .populate('purchasedCourses.course')
      .populate('enrolledCourses.course');
    
    if (!user) {
      return { valid: false, message: 'User not found' };
    }

    // Check if student has a startingOrder set for this bundle (manual enrollment)
    const startingOrder = await getStudentStartingOrderInBundle(userId, course.bundle);
    
    // If student has a startingOrder, check if this course is at or after that order
    if (startingOrder !== null) {
      if (course.order >= startingOrder) {
        // Student can access this course and all courses after their starting order
        return { valid: true };
      }
      // If course is before startingOrder, continue with validation below
    }

    // Find the highest order course the student has access to in this bundle
    let highestPurchasedOrder = -1;
    for (const bundleCourse of bundleCourses) {
      const hasAccess = user.hasAccessToCourse(bundleCourse._id.toString());
      if (hasAccess) {
        if (bundleCourse.order > highestPurchasedOrder) {
          highestPurchasedOrder = bundleCourse.order;
        }
      }
    }

    // Also check cart for highest order
    for (const cartItem of cartItems) {
      if (cartItem.type === 'course') {
        const cartCourse = bundleCourses.find(
          c => c._id.toString() === cartItem.id
        );
        if (cartCourse && cartCourse.order > highestPurchasedOrder) {
          highestPurchasedOrder = cartCourse.order;
        }
      }
    }

    // If student has purchased any course in this bundle, they can purchase courses
    // that come after their highest purchased course without needing earlier ones
    if (highestPurchasedOrder >= 0 && course.order > highestPurchasedOrder) {
      // Student can purchase this course (it's after their highest purchased)
      return { valid: true };
    }

    // Check all previous courses (with lower order)
    const previousCourses = bundleCourses.slice(0, currentIndex);
    const missingCourses = [];

    for (const prevCourse of previousCourses) {
      // Skip if this previous course is before or equal to the student's highest purchased order
      if (highestPurchasedOrder >= 0 && prevCourse.order <= highestPurchasedOrder) {
        continue; // Student already has access to courses up to highestPurchasedOrder
      }

      // Check if user has purchased/enrolled in this course
      const hasPurchased = user.hasAccessToCourse(prevCourse._id.toString());
      
      // Check if course is in cart
      const inCart = cartItems.some(
        (item) => item.type === 'course' && item.id === prevCourse._id.toString()
      );

      if (!hasPurchased && !inCart) {
        missingCourses.push({
          id: prevCourse._id.toString(),
          title: prevCourse.title,
          order: prevCourse.order
        });
      }
    }

    if (missingCourses.length > 0) {
      // Sort by order and get the first missing course
      missingCourses.sort((a, b) => a.order - b.order);
      const firstMissing = missingCourses[0];
      
      return {
        valid: false,
        message: `Please purchase "${firstMissing.title}" (Order ${firstMissing.order}) first. Courses must be added in sequential order.`,
        missingCourse: firstMissing
      };
    }

    return { valid: true };
  } catch (error) {
    console.error('Error validating course ordering:', error);
    return { valid: false, message: 'Error validating course order' };
  }
}

// Helper function to validate course ordering when removing from cart
async function validateCourseRemoval(courseId, userId, cartItems = []) {
  try {
    const course = await Course.findById(courseId).select('order bundle requiresSequential');
    if (!course) {
      return { valid: true }; // If course not found, allow removal
    }

    // If sequential requirement is disabled, allow removal
    if (!course.requiresSequential) {
      return { valid: true };
    }

    // Get all courses in the same bundle, sorted by order
    const bundleCourses = await Course.find({ bundle: course.bundle })
      .select('_id title order')
      .sort({ order: 1 });

    // Find current course index
    const currentIndex = bundleCourses.findIndex(
      (c) => c._id.toString() === courseId.toString()
    );

    // Check if any courses with higher order depend on this course
    const dependentCourses = bundleCourses.slice(currentIndex + 1);
    const blockingCourses = [];

    for (const depCourse of dependentCourses) {
      // Check if dependent course is in cart
      const inCart = cartItems.some(
        (item) => item.type === 'course' && item.id === depCourse._id.toString()
      );

      if (inCart) {
        blockingCourses.push({
          id: depCourse._id.toString(),
          title: depCourse.title,
          order: depCourse.order
        });
      }
    }

    if (blockingCourses.length > 0) {
      // Sort by order and get the first blocking course
      blockingCourses.sort((a, b) => a.order - b.order);
      const firstBlocking = blockingCourses[0];
      
      return {
        valid: false,
        message: `Cannot remove. "${firstBlocking.title}" (Order ${firstBlocking.order}) requires this course. Remove courses in reverse order.`,
        blockingCourse: firstBlocking
      };
    }

    return { valid: true };
  } catch (error) {
    console.error('Error validating course removal:', error);
    return { valid: true }; // On error, allow removal to avoid blocking user
  }
}

// Helper function to validate all courses in cart have proper ordering
async function validateCartOrdering(cartItems, userId) {
  try {
    const courseItems = cartItems.filter(item => item.type === 'course');
    
    if (courseItems.length === 0) {
      return { valid: true };
    }

    // Group courses by bundle
    const bundleGroups = {};
    for (const item of courseItems) {
      const course = await Course.findById(item.id).select('bundle order');
      if (course && course.bundle) {
        const bundleId = course.bundle.toString();
        if (!bundleGroups[bundleId]) {
          bundleGroups[bundleId] = [];
        }
        bundleGroups[bundleId].push({
          id: item.id,
          order: course.order || 0
        });
      }
    }

    // Validate each bundle group
    for (const [bundleId, courses] of Object.entries(bundleGroups)) {
      // Sort by order
      courses.sort((a, b) => a.order - b.order);
      
      // Get all courses in this bundle
      const bundleCourses = await Course.find({ bundle: bundleId })
        .select('_id title order requiresSequential')
        .sort({ order: 1 });

      // Get user's purchased courses
      const user = await User.findById(userId)
        .populate('purchasedCourses.course')
        .populate('enrolledCourses.course');

      if (!user) {
        return { valid: false, message: 'User not found' };
      }

      // Check if student has a startingOrder set for this bundle (manual enrollment)
      const startingOrder = await getStudentStartingOrderInBundle(userId, bundleId);

      // Check ordering for each course in cart
      for (let i = 0; i < courses.length; i++) {
        const cartCourse = courses[i];
        const courseIndex = bundleCourses.findIndex(
          c => c._id.toString() === cartCourse.id
        );

        if (courseIndex === -1) continue;

        const course = bundleCourses[courseIndex];
        
        // Skip if sequential requirement is disabled
        if (!course.requiresSequential) continue;

        // If student has a startingOrder, check if this course is at or after that order
        if (startingOrder !== null) {
          if (course.order >= startingOrder) {
            // Student can access this course - skip further validation
            continue;
          }
          // If course is before startingOrder, they might still want to buy it (catch up)
          // Allow it but continue with normal validation
        }

        // Find the highest order course the student has access to in this bundle
        let highestPurchasedOrder = -1;
        for (const bundleCourse of bundleCourses) {
          if (user.hasAccessToCourse(bundleCourse._id.toString())) {
            if (bundleCourse.order > highestPurchasedOrder) {
              highestPurchasedOrder = bundleCourse.order;
            }
          }
        }

        // Also check cart for highest order
        for (const cartCourse of courses) {
          const bundleCourse = bundleCourses.find(
            c => c._id.toString() === cartCourse.id
          );
          if (bundleCourse && bundleCourse.order > highestPurchasedOrder) {
            highestPurchasedOrder = bundleCourse.order;
          }
        }

        // If student has purchased any course in this bundle, they can purchase courses
        // that come after their highest purchased course without needing earlier ones
        if (highestPurchasedOrder >= 0 && course.order > highestPurchasedOrder) {
          // Student can purchase this course (it's after their highest purchased)
          continue;
        }

        // Check all previous courses
        const previousCourses = bundleCourses.slice(0, courseIndex);
        for (const prevCourse of previousCourses) {
          // Skip if prevCourse is before startingOrder (student doesn't need it)
          if (startingOrder !== null && prevCourse.order < startingOrder) {
            continue;
          }

          // Skip if this previous course is before the student's highest purchased order
          if (highestPurchasedOrder >= 0 && prevCourse.order <= highestPurchasedOrder) {
            continue; // Student already has access to courses up to highestPurchasedOrder
          }

          const hasPurchased = user.hasAccessToCourse(prevCourse._id.toString());
          const inCart = courses.some(c => c.id === prevCourse._id.toString());

          if (!hasPurchased && !inCart) {
            return {
              valid: false,
              message: `Invalid order. Purchase "${prevCourse.title}" (Order ${prevCourse.order}) before "${course.title}" (Order ${course.order}).`,
              missingCourse: {
                id: prevCourse._id.toString(),
                title: prevCourse.title,
                order: prevCourse.order
              }
            };
          }
        }
      }
    }

    return { valid: true };
  } catch (error) {
    console.error('Error validating cart ordering:', error);
    return { valid: false, message: 'Error validating course order in cart' };
  }
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
        if (
          cartItem.type === 'bundle' &&
          user.hasPurchasedBundle(cartItem.id)
        ) {
          console.log(
            `Removing already purchased bundle from cart: ${cartItem.id}`
          );
          continue;
        }
        if (cartItem.type === 'course' && user.hasAccessToCourse(cartItem.id)) {
          console.log(
            `Removing already purchased course from cart: ${cartItem.id}`
          );
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

  const total = subtotal;

  return {
    items: validItems,
    subtotal,
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
        console.log(
          `Cart cleared after ${reason}. ${cartCount} items removed.`
        );
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
      const recalculatedCart = await recalculateCartFromDB(
        req.session.cart,
        userId
      );

      // Update session cart with validated items
      req.session.cart = recalculatedCart.validItems;

      // Attach validated cart data to request for use in controllers
      req.validatedCart = {
        items: recalculatedCart.items,
        subtotal: recalculatedCart.subtotal,
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
      total: 0,
      cartCount: 0,
    };
    next();
  }
};

// Helper function to validate and apply promo code
async function validateAndApplyPromoCode(
  promoCode,
  userId,
  cartItems,
  subtotal,
  userEmail = null
) {
  try {
    // Check if promo code exists and is valid
    const promo = await PromoCode.findValidPromoCode(
      promoCode,
      userId,
      userEmail
    );

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
      originalAmount: subtotal,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// API endpoint to validate promo code
const validatePromoCode = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'Please login to use promo codes',
      });
    }

    const { promoCode } = req.body;
    const validatedCart = req.validatedCart;

    if (!promoCode) {
      return res.status(400).json({
        success: false,
        message: 'Promo code is required',
      });
    }

    if (validatedCart.cartCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
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
        originalAmount: result.originalAmount,
      };

      res.json({
        success: true,
        message: 'Promo code applied successfully',
        discountAmount: result.discountAmount,
        finalAmount: result.finalAmount,
        originalAmount: result.originalAmount,
        promoCode: result.promoCode.code,
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error,
      });
    }
  } catch (error) {
    console.error('Error validating promo code:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating promo code',
    });
  }
};

// API endpoint to remove promo code
const removePromoCode = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'Please login to manage promo codes',
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
      discountAmount: 0,
    });
  } catch (error) {
    console.error('Error removing promo code:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing promo code',
    });
  }
};

// Helper function to clear invalid promo code from session
const clearInvalidPromoCode = (req) => {
  if (req.session.appliedPromoCode) {
    console.log(
      'Clearing invalid promo code from session:',
      req.session.appliedPromoCode.code
    );
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

    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'Please login to add items to cart',
      });
    }

    // Validate item exists and get price from database
    let item;
    if (itemType === 'bundle') {
      item = await BundleCourse.findById(itemId).select(
        'title price discountPrice thumbnail status isActive isFullyBooked fullyBookedMessage'
      );
    } else {
      item = await Course.findById(itemId).select(
        'title price discountPrice thumbnail status isActive isFullyBooked fullyBookedMessage'
      );
    }

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found',
      });
    }

    // Check if item is fully booked
    if (item.isFullyBooked) {
      return res.status(400).json({
        success: false,
        message: item.fullyBookedMessage || 'This item is fully booked',
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
      // Validate course ordering before adding to cart
      const orderValidation = await validateCourseOrdering(
        itemId,
        req.session.user.id,
        req.session.cart
      );

      if (!orderValidation.valid) {
        return res.status(400).json({
          success: false,
          message: orderValidation.message,
          missingCourse: orderValidation.missingCourse
        });
      }

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

    // Validate course ordering when removing from cart
    if (itemType === 'course' && req.session.user) {
      const removalValidation = await validateCourseRemoval(
        itemId,
        req.session.user.id,
        req.session.cart
      );

      if (!removalValidation.valid) {
        return res.status(400).json({
          success: false,
          message: removalValidation.message,
          blockingCourse: removalValidation.blockingCourse
        });
      }
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

    // Check if bundle or course query parameter is present (for "Buy Now" functionality)
    const bundleId = req.query.bundle;
    const courseId = req.query.course;

    if (bundleId) {
      // Initialize cart if not exists
      if (!req.session.cart) {
        req.session.cart = [];
      }

      // Check if bundle is already in cart
      const existingBundle = req.session.cart.find(
        (cartItem) => cartItem.id === bundleId && cartItem.type === 'bundle'
      );

      if (!existingBundle) {
        // Add bundle to cart - fetch with courses populated for conflict check
        const bundle = await BundleCourse.findById(bundleId)
          .select('title price discountPrice thumbnail status isActive isFullyBooked fullyBookedMessage')
          .populate('courses');

        if (!bundle) {
          req.flash('error_msg', 'Bundle not found');
          return res.redirect('/');
        }

        // Check if bundle is fully booked
        if (bundle.isFullyBooked) {
          req.flash('error_msg', bundle.fullyBookedMessage || 'This bundle is fully booked');
          return res.redirect('back');
        }

        // Validate bundle is available for purchase
        if (!bundle.isActive || bundle.status !== 'published') {
          req.flash('error_msg', 'This bundle is not available for purchase');
          return res.redirect('/');
        }

        // Check if user already purchased this bundle
        const user = await User.findById(req.session.user.id);
        if (user && user.hasPurchasedBundle(bundleId)) {
          req.flash('error_msg', 'You have already purchased this bundle');
          return res.redirect('/');
        }

        // Check for bundle/course conflicts
        if (bundle.courses && bundle.courses.length > 0) {
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
            req.flash('error_msg', `This bundle contains courses that are already in your cart: ${conflictingCourses.join(', ')}. Please remove those individual courses first if you want to purchase the bundle.`);
            return res.redirect('back');
          }
        }

        // Calculate final price
        const originalPrice = bundle.price || 0;
        const discountPercentage = bundle.discountPrice || 0;
        let finalPrice = originalPrice;

        if (discountPercentage > 0) {
          finalPrice = originalPrice - originalPrice * (discountPercentage / 100);
        }

        // Add bundle to cart
        const cartItem = {
          id: bundleId,
          type: 'bundle',
          title: bundle.title,
          originalPrice: originalPrice,
          discountPrice: discountPercentage,
          price: finalPrice,
          image: bundle.thumbnail || '/images/adad.png',
          addedAt: new Date(),
        };

        req.session.cart.push(cartItem);
      }
    } else if (courseId) {
      // Initialize cart if not exists
      if (!req.session.cart) {
        req.session.cart = [];
      }

      // Check if course is already in cart
      const existingCourse = req.session.cart.find(
        (cartItem) => cartItem.id === courseId && cartItem.type === 'course'
      );

      if (!existingCourse) {
        // Add course to cart
        const course = await Course.findById(courseId).select(
          'title price discountPrice thumbnail status isActive isFullyBooked fullyBookedMessage'
        );

        if (!course) {
          req.flash('error_msg', 'Course not found');
          return res.redirect('/');
        }

        // Check if course is fully booked
        if (course.isFullyBooked) {
          req.flash('error_msg', course.fullyBookedMessage || 'This course is fully booked');
          return res.redirect('back');
        }

        // Validate course is available for purchase
        if (!course.isActive || course.status !== 'published') {
          req.flash('error_msg', 'This course is not available for purchase');
          return res.redirect('/');
        }

        // Check if user already has access to this course
        const user = await User.findById(req.session.user.id);
        if (user && user.hasAccessToCourse(courseId)) {
          req.flash('error_msg', 'You already have access to this course');
          return res.redirect('/');
        }

        // Validate course ordering
        const orderValidation = await validateCourseOrdering(
          courseId,
          req.session.user.id,
          req.session.cart
        );

        if (!orderValidation.valid) {
          req.flash('error_msg', orderValidation.message);
          return res.redirect('back');
        }

        // Check if this course is already in a bundle that's in the cart
        for (const cartItem of req.session.cart) {
          if (cartItem.type === 'bundle') {
            const bundle = await BundleCourse.findById(cartItem.id).populate('courses');
            if (
              bundle &&
              bundle.courses.some((c) => c._id.toString() === courseId)
            ) {
              req.flash('error_msg', `This course is already included in the "${bundle.title}" bundle in your cart. Please remove the bundle first if you want to purchase this course individually.`);
              return res.redirect('back');
            }
          }
        }

        // Calculate final price
        const originalPrice = course.price || 0;
        const discountPercentage = course.discountPrice || 0;
        let finalPrice = originalPrice;

        if (discountPercentage > 0) {
          finalPrice = originalPrice - originalPrice * (discountPercentage / 100);
        }

        // Add course to cart
        const cartItem = {
          id: courseId,
          type: 'course',
          title: course.title,
          originalPrice: originalPrice,
          discountPrice: discountPercentage,
          price: finalPrice,
          image: course.thumbnail || '/images/adad.png',
          addedAt: new Date(),
        };

        req.session.cart.push(cartItem);
      }
    }

    // If we added items from query params, we need to re-validate the cart
    // since validateCartMiddleware already ran before getCheckout
    let validatedCart = req.validatedCart;
    
    if (bundleId || courseId) {
      // Recalculate cart from database to include newly added items
      const recalculatedCart = await recalculateCartFromDB(
        req.session.cart,
        req.session.user.id
      );

      // Update session cart with validated items
      req.session.cart = recalculatedCart.validItems;

      // Update validatedCart with new data
      validatedCart = {
        items: recalculatedCart.items,
        subtotal: recalculatedCart.subtotal,
        total: recalculatedCart.total,
        cartCount: recalculatedCart.items.length,
      };
    }

    if (validatedCart.cartCount === 0) {
      req.flash('error_msg', 'Your cart is empty or contains invalid items');
      return res.redirect('/');
    }

    // Validate course ordering at checkout page
    if (req.session.user) {
      const cartOrderValidation = await validateCartOrdering(
        validatedCart.items,
        req.session.user.id
      );

      if (!cartOrderValidation.valid) {
        req.flash('error_msg', cartOrderValidation.message);
        return res.redirect('back');
      }
    }

    // Get available books for bundles in cart (both direct bundles and courses from bundles)
    // Logic: If a student buys a course from a bundle, they should see the bundle's book
    // But if they already bought the book for that bundle (even with a different course), it won't show again
    const availableBooks = [];
    const bundleIds = new Set(); // Use Set to avoid duplicates

    // Collect bundle IDs from cart (both direct bundles and courses' parent bundles)
    for (const item of validatedCart.items) {
      if (item.type === 'bundle' && item.id) {
        // Direct bundle purchase
        bundleIds.add(item.id.toString());
      } else if (item.type === 'course' && item.id) {
        // Course purchase - find which bundle this course belongs to
        const course = await Course.findById(item.id).select('bundle');
        if (course && course.bundle) {
          bundleIds.add(course.bundle.toString());
        }
      }
    }

    // Get bundles with books
    if (bundleIds.size > 0) {
      const bundles = await BundleCourse.find({
        _id: { $in: Array.from(bundleIds) },
        hasBook: true,
        bookPrice: { $gt: 0 },
      }).select('_id title bundleCode bookName bookPrice thumbnail');

      // Check which books user already purchased
      const user = await User.findById(req.session.user.id);
      for (const bundle of bundles) {
        // Check if user has already ordered the book for this bundle
        const hasOrderedBook = await BookOrder.hasUserOrderedBook(
          user._id,
          bundle._id
        );

        if (!hasOrderedBook) {
          // Check if this book is already in availableBooks (avoid duplicates)
          const alreadyAdded = availableBooks.some(
            book => book.bundleId === bundle._id.toString()
          );
          
          if (!alreadyAdded) {
            availableBooks.push({
              bundleId: bundle._id.toString(),
              bundleTitle: bundle.title,
              bundleCode: bundle.bundleCode,
              bookName: bundle.bookName,
              bookPrice: bundle.bookPrice,
              thumbnail: bundle.thumbnail || '/images/bundle-placeholder.jpg',
            });
          }
        }
      }
    }

    // Check if there's an applied promo code in session
    let appliedPromo = null;
    if (req.session.appliedPromoCode) {
      appliedPromo = {
        code: req.session.appliedPromoCode.code,
        discountAmount: req.session.appliedPromoCode.discountAmount,
        finalAmount: req.session.appliedPromoCode.finalAmount,
        originalAmount: req.session.appliedPromoCode.originalAmount,
      };
    }

    res.render('checkout', {
      title: 'Checkout | ELKABLY',
      theme: req.cookies.theme || 'light',
      cart: validatedCart.items,
      subtotal: validatedCart.subtotal,
      total: validatedCart.total,
      user: req.session.user,
      availableBooks: availableBooks,
      appliedPromoCode: appliedPromo, // Pass promo code to view
      // Payment method availability
      paymentMethods: {
        card: !!process.env.PAYMOB_INTEGRATION_ID_CARD,
        wallet: !!process.env.PAYMOB_INTEGRATION_ID_WALLET,
        kiosk: !!process.env.PAYMOB_INTEGRATION_ID_KIOSK,
      },
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

    // Validate course ordering at checkout
    if (req.session.user) {
      const cartOrderValidation = await validateCartOrdering(
        validatedCart.items,
        req.session.user.id
      );

      if (!cartOrderValidation.valid) {
        return res.status(400).json({
          success: false,
          message: cartOrderValidation.message,
          missingCourse: cartOrderValidation.missingCourse
        });
      }
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
      console.log(
        '📱 Sending WhatsApp notification for direct checkout:',
        purchase.orderNumber
      );
      await whatsappSMSNotificationService.sendPurchaseInvoiceNotification(
        user._id,
        purchase
      );

      // Mark WhatsApp notification as sent
      purchase.whatsappNotificationSent = true;
      await purchase.save();
      console.log('✅ WhatsApp notification sent for direct checkout');
    } catch (whatsappError) {
      console.error(
        '❌ WhatsApp notification error for direct checkout:',
        whatsappError
      );
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

    // Validate course ordering at checkout
    const cartOrderValidation = await validateCartOrdering(
      validatedCart.items,
      req.session.user.id
    );

    if (!cartOrderValidation.valid) {
      return res.status(400).json({
        success: false,
        message: cartOrderValidation.message,
        missingCourse: cartOrderValidation.missingCourse
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
        message: `You already have access to: ${alreadyPurchasedItems.join(
          ', '
        )}. Please remove these items from your cart.`,
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
        finalTotal = promoValidation.finalAmount; // Use server-calculated final amount

        // SECURITY: Validate that session promo code data matches server calculation
        const sessionDiscount =
          req.session.appliedPromoCode.discountAmount || 0;
        const sessionFinal = req.session.appliedPromoCode.finalAmount || 0;

        if (
          Math.abs(sessionDiscount - discountAmount) > 0.01 ||
          Math.abs(sessionFinal - finalTotal) > 0.01
        ) {
          console.warn(
            'Promo code session data mismatch, using server calculation:',
            {
              sessionDiscount,
              serverDiscount: discountAmount,
              sessionFinal,
              serverFinal: finalTotal,
            }
          );
        }

        console.log('Promo code applied successfully:', {
          originalAmount: validatedCart.subtotal,
          discountAmount: discountAmount,
          finalAmount: finalTotal,
          promoCode: appliedPromoCode.code,
        });
      } else {
        // Remove invalid promo code from session
        delete req.session.appliedPromoCode;
        return res.status(400).json({
          success: false,
          message: `Promo code is no longer valid: ${promoValidation.error}`,
        });
      }
    }

    // Handle book orders if selected
    const selectedBooks = req.body.selectedBooks || [];
    let booksSubtotal = 0;
    const bookOrders = [];

    if (selectedBooks.length > 0) {
      // Validate and calculate book prices
      const bundles = await BundleCourse.find({
        _id: { $in: selectedBooks },
        hasBook: true,
        bookPrice: { $gt: 0 },
      }).select('_id bookName bookPrice');

      for (const bundle of bundles) {
        booksSubtotal += bundle.bookPrice;
      }
    }

    // Update totals to include books
    const totalWithBooks = finalTotal + booksSubtotal;

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
      subtotal: finalSubtotal + booksSubtotal,
      total: totalWithBooks,
      booksSubtotal: booksSubtotal,
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

    // Create book orders if books were selected
    if (selectedBooks.length > 0) {
      const bundles = await BundleCourse.find({
        _id: { $in: selectedBooks },
        hasBook: true,
        bookPrice: { $gt: 0 },
      }).select('_id bookName bookPrice title bundleCode');

      for (const bundle of bundles) {
        const bookOrder = new BookOrder({
          user: req.session.user.id,
          bundle: bundle._id,
          bookName: bundle.bookName,
          bookPrice: bundle.bookPrice,
          purchase: purchase._id,
          orderNumber: purchase.orderNumber,
          shippingAddress: billingAddress,
          status: 'pending',
        });
        await bookOrder.save();
        bookOrders.push(bookOrder._id);
      }

      // Update purchase with book orders
      purchase.bookOrders = bookOrders;
      await purchase.save();
    }

    // Create Paymob payment session using validated data
    const orderItems = validatedCart.items.map((item) => ({
      title: item.title,
      price: item.price, // Database-validated price
      quantity: 1,
      description: `${item.type === 'bundle' ? 'Bundle' : 'Course'}: ${
        item.title
      }`,
    }));

    // Add book items to order
    if (selectedBooks.length > 0) {
      const bundles = await BundleCourse.find({
        _id: { $in: selectedBooks },
        hasBook: true,
        bookPrice: { $gt: 0 },
      }).select('_id bookName bookPrice');

      for (const bundle of bundles) {
        orderItems.push({
          title: bundle.bookName,
          price: bundle.bookPrice,
          quantity: 1,
          description: `Book: ${bundle.bookName}`,
        });
      }
    }

    const orderData = {
      total: totalWithBooks, // Use final total including books
      merchantOrderId,
      items: orderItems,
    };

    // Log payment data for debugging
    console.log('Creating payment session with data:', {
      originalSubtotal: validatedCart.subtotal,
      booksSubtotal: booksSubtotal,
      finalTotal: totalWithBooks,
      discountAmount: discountAmount,
      promoCode: appliedPromoCode ? appliedPromoCode.code : 'none',
      merchantOrderId: merchantOrderId,
      booksCount: selectedBooks.length,
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

      // Cancel any book orders associated with this failed purchase
      if (purchase.bookOrders && purchase.bookOrders.length > 0) {
        await BookOrder.updateMany(
          { _id: { $in: purchase.bookOrders } },
          { status: 'cancelled' }
        );
        console.log(`📚 Cancelled ${purchase.bookOrders.length} book order(s) due to payment session creation failure`);
      }

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
        checkoutUrl: paymentSession.checkoutUrl || paymentSession.iframeUrl, // Unified checkout URL
        isUnifiedCheckout: paymentSession.isUnifiedCheckout || false,
        orderNumber: purchase.orderNumber,
        total: totalWithBooks, // Use the final total including books and promo discount
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

    // Verify HMAC if transaction data is present in query params
    if (req.query.id || req.query.order) {
      console.log('🔐 Verifying HMAC for payment callback...');
      const transactionData = {
        obj: {
          amount_cents: req.query.amount_cents,
          created_at: req.query.created_at,
          currency: req.query.currency,
          error_occured: req.query.error_occured === 'true',
          has_parent_transaction: req.query.has_parent_transaction === 'true',
          id: req.query.id,
          integration_id: req.query.integration_id,
          is_3d_secure: req.query.is_3d_secure === 'true',
          is_auth: req.query.is_auth === 'true',
          is_capture: req.query.is_capture === 'true',
          is_refunded: req.query.is_refunded === 'true',
          is_standalone_payment: req.query.is_standalone_payment === 'true',
          is_voided: req.query.is_voided === 'true',
          order: req.query.order,
          owner: req.query.owner,
          pending: req.query.pending === 'true',
          source_data: {
            pan: req.query['source_data.pan'],
            sub_type: req.query['source_data.sub_type'],
            type: req.query['source_data.type'],
          },
          success: req.query.success === 'true',
        },
        hmac: req.query.hmac,
      };

      const hmacValid = paymobService.verifyTransactionHMAC(transactionData);
      if (!hmacValid) {
        console.error('❌ HMAC verification failed for payment callback');
        console.error('Transaction ID:', req.query.id);
        console.error('Merchant Order ID:', req.query.merchant_order_id);

        // In production, reject invalid HMAC
        if (process.env.NODE_ENV === 'production') {
          return res.render('payment-fail', {
            title: 'Payment Verification Failed | ELKABLY',
            theme: req.cookies.theme || 'light',
            message:
              'Payment verification failed. Please contact support if you were charged.',
          });
        } else {
          console.warn('⚠️ Proceeding despite HMAC failure (development mode)');
        }
      } else {
        console.log('✅ HMAC verification successful');
      }
    }

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
          console.log(
            '📱 Sending WhatsApp notification for completed purchase:',
            purchase.orderNumber
          );
          await whatsappSMSNotificationService.sendPurchaseInvoiceNotification(
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

      // Populate book orders if they exist
      const purchaseObj = purchase.toObject();
      if (purchaseObj.bookOrders && purchaseObj.bookOrders.length > 0) {
        const bookOrders = await BookOrder.find({ _id: { $in: purchaseObj.bookOrders } })
          .populate('bundle', 'title bundleCode')
          .lean();
        purchaseObj.bookOrders = bookOrders || [];

        // Send library notification for book orders
        try {
          console.log(
            '📚 Sending library notification for book orders (already completed purchase):',
            purchase.orderNumber
          );
          const libraryUser = await User.findById(purchase.user._id || purchase.user);
          if (libraryUser) {
            await sendLibraryBookOrderNotification(bookOrders, libraryUser);
            console.log('✅ Library notification sent successfully');
          }
        } catch (libraryError) {
          console.error('❌ Library notification error:', libraryError);
          // Don't fail the payment success if library notification fails
        }
      } else {
        purchaseObj.bookOrders = [];
      }

      return res.render('payment-success', {
        title: 'Payment Successful - Mr Kably',
        theme: req.cookies.theme || 'light',
        purchase: purchaseObj,
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
              usedAt: new Date(),
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
      console.log(
        '📱 Sending WhatsApp notification for new purchase:',
        purchase.orderNumber
      );
      await whatsappSMSNotificationService.sendPurchaseInvoiceNotification(
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

    // Populate book orders if they exist
    const purchaseObj = purchase.toObject();
    if (purchaseObj.bookOrders && purchaseObj.bookOrders.length > 0) {
      const bookOrders = await BookOrder.find({ _id: { $in: purchaseObj.bookOrders } })
        .populate('bundle', 'title bundleCode')
        .lean();
      purchaseObj.bookOrders = bookOrders || [];

      // Send library notification for book orders
      try {
        console.log(
          '📚 Sending library notification for book orders:',
          purchase.orderNumber
        );
        await sendLibraryBookOrderNotification(bookOrders, user);
        console.log('✅ Library notification sent successfully');
      } catch (libraryError) {
        console.error('❌ Library notification error:', libraryError);
        // Don't fail the payment success if library notification fails
      }
    } else {
      purchaseObj.bookOrders = [];
    }

    res.render('payment-success', {
      title: 'Payment Successful - Mr Kably',
      theme: req.cookies.theme || 'light',
      purchase: purchaseObj,
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
    const { merchantOrderId, reason, transactionId, orderId } = req.query;

    if (merchantOrderId) {
      // Update purchase status to failed
      const purchase = await Purchase.findOne({
        paymentIntentId: merchantOrderId,
      });

      if (purchase && purchase.status === 'pending') {
        purchase.status = 'failed';
        purchase.paymentStatus = 'failed';

        // Save Paymob IDs if available
        if (transactionId) {
          purchase.paymobTransactionId = String(transactionId);
        }
        if (orderId) {
          purchase.paymobOrderId = String(orderId);
        }

        // Save failure reason
        if (reason) {
          purchase.failureReason = decodeURIComponent(reason);
        }

        await purchase.save();

        // Cancel any book orders associated with this failed purchase
        if (purchase.bookOrders && purchase.bookOrders.length > 0) {
          await BookOrder.updateMany(
            { _id: { $in: purchase.bookOrders } },
            { status: 'cancelled' }
          );
          console.log(`📚 Cancelled ${purchase.bookOrders.length} book order(s) for failed payment`);
        }

        console.log('💾 Payment failed and saved for order:', {
          orderNumber: purchase.orderNumber,
          paymobTransactionId: purchase.paymobTransactionId,
          paymobOrderId: purchase.paymobOrderId,
          failureReason: purchase.failureReason,
          status: purchase.status,
        });
      }
    }

    // Clear the cart after failed payment
    clearCart(req, 'payment failed');

    // Get friendly error message
    const errorMessage = req.query.reason
      ? decodeURIComponent(req.query.reason)
      : 'Your payment could not be processed. Please try again or contact support.';

    res.render('payment-fail', {
      title: 'Payment Failed - Mr Kably',
      theme: req.cookies.theme || 'light',
      message: errorMessage,
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

    // Verify HMAC for transaction data (recommended by Paymob)
    const hmacValid = paymobService.verifyTransactionHMAC(payload);
    if (!hmacValid && process.env.NODE_ENV === 'production') {
      console.error('❌ HMAC verification failed for webhook');
      console.error('Transaction ID:', payload?.obj?.id || payload?.id);
      console.error(
        'Merchant Order ID:',
        payload?.obj?.order?.merchant_order_id
      );
      // Still process but log the failure
      console.warn('⚠️ Processing webhook despite HMAC failure (for testing)');
    }

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

    // Save Paymob transaction details
    const transactionId =
      payload?.obj?.id || payload?.id || webhookData.transactionId;
    const paymobOrderId =
      payload?.obj?.order?.id || payload?.obj?.order || payload?.order;

    if (transactionId) {
      purchase.paymobTransactionId = String(transactionId);
    }
    if (paymobOrderId) {
      purchase.paymobOrderId = String(paymobOrderId);
    }

    // Only process if current status is pending
    if (purchase.status !== 'pending') {
      return res.status(200).send('OK');
    }

    // Handle FAILED webhook
    if (webhookData.isFailed) {
      console.log(
        '❌ Webhook: Payment FAILED for order:',
        purchase.orderNumber
      );

      purchase.status = 'failed';
      purchase.paymentStatus = 'failed';

      // Extract failure reason
      const failureReason =
        payload?.obj?.data?.message ||
        payload?.data?.message ||
        payload?.obj?.message ||
        'Payment declined or failed';

      purchase.failureReason = failureReason;
      purchase.paymentGatewayResponse = webhookData.rawPayload;
      await purchase.save();

      // Cancel any book orders associated with this failed purchase
      if (purchase.bookOrders && purchase.bookOrders.length > 0) {
        await BookOrder.updateMany(
          { _id: { $in: purchase.bookOrders } },
          { status: 'cancelled' }
        );
        console.log(`📚 Webhook: Cancelled ${purchase.bookOrders.length} book order(s) for failed payment`);
      }

      console.log('💾 Failed purchase saved via webhook:', {
        orderNumber: purchase.orderNumber,
        paymobTransactionId: purchase.paymobTransactionId,
        paymobOrderId: purchase.paymobOrderId,
        failureReason: purchase.failureReason,
        status: purchase.status,
      });

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
            const promoCode = await PromoCode.findById(
              purchase.appliedPromoCode
            );
            if (promoCode) {
              // Add to usage history
              promoCode.usageHistory.push({
                user: purchase.user._id,
                purchase: purchase._id,
                discountAmount: purchase.discountAmount,
                originalAmount: purchase.originalAmount,
                finalAmount: purchase.total,
                usedAt: new Date(),
              });

              // Increment current uses
              promoCode.currentUses += 1;
              await promoCode.save();

              console.log('Promo code usage tracked:', {
                code: promoCode.code,
                user: purchase.user._id,
                purchase: purchase._id,
                discountAmount: purchase.discountAmount,
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

      //   const invoiceUrl = await whatsappSMSNotificationService.generateAndUploadInvoice(purchase);
      //   console.log(`[Webhook] Invoice URL generated: ${invoiceUrl}`);

      //   const whatsappResult = await whatsappSMSNotificationService.sendPurchaseInvoiceNotification(
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

      // Send library notification for book orders if they exist
      if (purchase.bookOrders && purchase.bookOrders.length > 0) {
        try {
          console.log(
            `[Webhook] 📚 Sending library notification for book orders: ${purchase.orderNumber}`
          );
          const bookOrders = await BookOrder.find({ _id: { $in: purchase.bookOrders } })
            .populate('bundle', 'title bundleCode')
            .lean();
          
          if (bookOrders && bookOrders.length > 0 && user) {
            await sendLibraryBookOrderNotification(bookOrders, user);
            console.log(`[Webhook] ✅ Library notification sent successfully`);
          }
        } catch (libraryError) {
          console.error(`[Webhook] ❌ Library notification error:`, libraryError);
          // Don't fail the webhook if library notification fails
        }
      }
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

    let merchantOrderId =
      req.query.merchant_order_id ||
      req.query.merchantOrder ||
      req.query.merchantOrderId;

    let purchase = null;

    // For unified checkout, merchant_order_id might not be in query params
    // Try to find purchase by transaction ID first
    if (!merchantOrderId && req.query.id) {
      console.log(
        'Unified checkout callback - looking up purchase by transaction ID or recent pending purchase...'
      );

      // Try to find the most recent pending purchase for the session user
      if (req.session && req.session.user) {
        const userId = req.session.user.id;
        purchase = await Purchase.findOne({
          user: userId,
          status: 'pending',
          paymentStatus: 'pending',
        })
          .sort({ createdAt: -1 }) // Most recent first
          .limit(1)
          .populate('user');

        if (purchase) {
          merchantOrderId = purchase.paymentIntentId;
          console.log(
            'Found pending purchase by user session:',
            merchantOrderId
          );
        }
      }
    }

    // If still no merchant order ID or purchase, try old API
    if (!merchantOrderId && !purchase) {
      console.warn('Webhook redirect: No merchant order ID found in query');
      return res.redirect('/purchase/payment/fail?reason=missing_order_id');
    }

    // Find purchase by merchant order ID if not already found
    if (!purchase) {
      purchase = await Purchase.findOne({
        paymentIntentId: merchantOrderId,
      }).populate('user');
    }

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
      transactionId: req.query.id,
      paymobOrderId: req.query.order,
      query: req.query,
    });

    // Save Paymob transaction details regardless of status
    if (req.query.id) {
      purchase.paymobTransactionId = req.query.id;
    }
    if (req.query.order) {
      purchase.paymobOrderId = req.query.order;
    }

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

    // Handle FAILED payment - Save with status 'failed'
    if (webhookData.isFailed) {
      console.log(
        '❌ Webhook redirect: Payment FAILED for order:',
        purchase.orderNumber
      );

      // Update purchase status to failed
      purchase.status = 'failed';
      purchase.paymentStatus = 'failed';

      // Save failure reason
      const failureReason =
        req.query['data.message'] ||
        req.query.message ||
        webhookData.rawPayload?.obj?.data?.message ||
        'Payment declined or failed';

      purchase.failureReason = failureReason;
      purchase.paymentGatewayResponse = {
        queryParams: req.query,
        processedAt: new Date(),
        status: 'failed',
      };

      await purchase.save();

      // Cancel any book orders associated with this failed purchase
      if (purchase.bookOrders && purchase.bookOrders.length > 0) {
        await BookOrder.updateMany(
          { _id: { $in: purchase.bookOrders } },
          { status: 'cancelled' }
        );
        console.log(`📚 Webhook redirect: Cancelled ${purchase.bookOrders.length} book order(s) for failed payment`);
      }

      console.log('💾 Failed purchase saved:', {
        orderNumber: purchase.orderNumber,
        paymobTransactionId: purchase.paymobTransactionId,
        paymobOrderId: purchase.paymobOrderId,
        failureReason: purchase.failureReason,
        status: purchase.status,
      });

      // Clear cart after failed payment
      clearCart(req, 'payment failed via webhook redirect');

      return res.redirect(
        `/purchase/payment/fail?reason=${encodeURIComponent(failureReason)}`
      );
    }

    if (webhookData.isSuccess) {
      console.log(
        '✅ Webhook redirect: Payment successful for order:',
        purchase.orderNumber
      );

      // Update purchase status
      purchase.status = 'completed';
      purchase.paymentStatus = 'completed';
      purchase.paymentGatewayResponse = {
        queryParams: req.query,
        processedAt: new Date(),
        status: 'completed',
      };
      await purchase.save();

      console.log('💾 Successful purchase saved:', {
        orderNumber: purchase.orderNumber,
        paymobTransactionId: purchase.paymobTransactionId,
        paymobOrderId: purchase.paymobOrderId,
        status: purchase.status,
      });

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
            const promoCode = await PromoCode.findById(
              purchase.appliedPromoCode
            );
            if (promoCode) {
              // Add to usage history
              promoCode.usageHistory.push({
                user: purchase.user._id,
                purchase: purchase._id,
                discountAmount: purchase.discountAmount,
                originalAmount: purchase.originalAmount,
                finalAmount: purchase.total,
                usedAt: new Date(),
              });

              // Increment current uses
              promoCode.currentUses += 1;
              await promoCode.save();

              console.log('Promo code usage tracked:', {
                code: promoCode.code,
                user: purchase.user._id,
                purchase: purchase._id,
                discountAmount: purchase.discountAmount,
              });
            }
          } catch (error) {
            console.error('Error tracking promo code usage:', error);
          }
        }
      }

      // Send library notification for book orders if they exist
      if (purchase.bookOrders && purchase.bookOrders.length > 0 && user) {
        try {
          console.log(
            `[Webhook Redirect] 📚 Sending library notification for book orders: ${purchase.orderNumber}`
          );
          const bookOrders = await BookOrder.find({ _id: { $in: purchase.bookOrders } })
            .populate('bundle', 'title bundleCode')
            .lean();
          
          if (bookOrders && bookOrders.length > 0) {
            await sendLibraryBookOrderNotification(bookOrders, user);
            console.log(`[Webhook Redirect] ✅ Library notification sent successfully`);
          }
        } catch (libraryError) {
          console.error(`[Webhook Redirect] ❌ Library notification error:`, libraryError);
          // Don't fail the webhook if library notification fails
        }
      }

      // Clear the cart after successful payment (webhook redirect)
      clearCart(req, 'webhook redirect success');

      return res.redirect(
        `/purchase/payment/success?merchantOrderId=${merchantOrderId}`
      );
    } else if (webhookData.isPending) {
      // Payment is still pending
      console.log(
        '⏳ Webhook redirect: Payment PENDING for order:',
        purchase.orderNumber
      );

      // Keep purchase as pending but save Paymob IDs
      purchase.paymentGatewayResponse = {
        queryParams: req.query,
        processedAt: new Date(),
        status: 'pending',
      };
      await purchase.save();

      console.log('💾 Pending purchase saved:', {
        orderNumber: purchase.orderNumber,
        paymobTransactionId: purchase.paymobTransactionId,
        paymobOrderId: purchase.paymobOrderId,
        status: purchase.status,
      });

      return res.redirect('/purchase/payment/fail?reason=payment_pending');
    } else {
      // Unknown status - treat as failed for safety
      console.log(
        '❓ Webhook redirect: Unknown payment status for order:',
        purchase.orderNumber
      );

      purchase.status = 'failed';
      purchase.paymentStatus = 'failed';
      purchase.failureReason = 'Unknown payment status';
      purchase.paymentGatewayResponse = {
        queryParams: req.query,
        processedAt: new Date(),
        status: 'unknown',
      };
      await purchase.save();

      // Cancel any book orders associated with this failed purchase
      if (purchase.bookOrders && purchase.bookOrders.length > 0) {
        await BookOrder.updateMany(
          { _id: { $in: purchase.bookOrders } },
          { status: 'cancelled' }
        );
        console.log(`📚 Webhook redirect: Cancelled ${purchase.bookOrders.length} book order(s) for unknown payment status`);
      }

      console.log('💾 Unknown status purchase saved as failed:', {
        orderNumber: purchase.orderNumber,
        paymobTransactionId: purchase.paymobTransactionId,
        paymobOrderId: purchase.paymobOrderId,
        status: purchase.status,
      });

      return res.redirect(
        '/purchase/payment/fail?reason=payment_status_unknown'
      );
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
