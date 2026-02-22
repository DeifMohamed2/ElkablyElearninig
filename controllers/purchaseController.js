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
const { PurchaseTracker } = require('../utils/activityTracker');
const { logError, logSystem } = require('../utils/logger');

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

/**
 * Process successful payment - Centralized function for webhook and redirect handlers
 * This is the SINGLE SOURCE OF TRUTH for payment success processing
 * @param {Object} purchase - The purchase object or ID
 * @param {Object} req - Optional request object for clearing session (only available in redirect handlers)
 */
async function processSuccessfulPayment(purchase, req = null) {
  try {
    // Reload purchase to ensure we have latest data
    const freshPurchase = await Purchase.findById(purchase._id || purchase)
      .populate('user')
      .populate('items.item');

    if (!freshPurchase) {
      throw new Error('Purchase not found');
    }

    // CRITICAL: Use atomic update to prevent race conditions
    // Only update if status is pending (idempotency check)
    if (freshPurchase.status !== 'pending') {
      console.log(
        `⚠️ Purchase ${freshPurchase.orderNumber} already processed with status: ${freshPurchase.status}`
      );
      
      // If already completed, verify enrollments are in place
      if (freshPurchase.status === 'completed') {
        const user = await User.findById(freshPurchase.user._id);
        let allEnrolled = true;
        
        for (const item of freshPurchase.items) {
          if (item.itemType === 'bundle') {
            const bundle = await BundleCourse.findById(item.item).populate('courses');
            if (bundle) {
              for (const course of bundle.courses) {
                if (!user.isEnrolled(course._id)) {
                  allEnrolled = false;
                  console.log(`⚠️ Missing enrollment for course ${course._id} in bundle ${bundle._id}`);
                }
              }
            }
          } else {
            if (!user.isEnrolled(item.item)) {
              allEnrolled = false;
              console.log(`⚠️ Missing enrollment for course ${item.item}`);
            }
          }
        }
        
        // If enrollments are missing, re-enroll
        if (!allEnrolled) {
          console.log(`🔧 Re-enrolling user for order ${freshPurchase.orderNumber}`);
          // Continue with enrollment process below
        } else {
          return { success: true, alreadyProcessed: true, purchase: freshPurchase };
        }
      } else {
        return { success: true, alreadyProcessed: true, purchase: freshPurchase };
      }
    }

    // ATOMIC UPDATE: Use findOneAndUpdate to ensure only one process can update at a time
    const updatedPurchase = await Purchase.findOneAndUpdate(
      { 
        _id: freshPurchase._id,
        status: 'pending' // Only update if still pending (prevents race conditions)
      },
      {
        $set: {
          status: 'completed',
          paymentStatus: 'completed',
          completedAt: new Date(),
        }
      },
      { new: true }
    ).populate('user').populate('items.item');

    // If update failed (another process already updated it), return
    if (!updatedPurchase || updatedPurchase.status !== 'completed') {
      console.log(
        `⚠️ Purchase ${freshPurchase.orderNumber} was updated by another process`
      );
      const reloaded = await Purchase.findById(freshPurchase._id)
        .populate('user')
        .populate('items.item');
      return { success: true, alreadyProcessed: true, purchase: reloaded };
    }

    // Use the updated purchase for rest of processing
    const purchaseToProcess = updatedPurchase;

    // Update book orders status to 'processing' when payment is completed
    if (purchaseToProcess.bookOrders && purchaseToProcess.bookOrders.length > 0) {
      await BookOrder.updateMany(
        { _id: { $in: purchaseToProcess.bookOrders } },
        { 
          status: 'processing',
          $unset: { cancelledAt: '' } // Remove cancelledAt if it exists
        }
      );
      console.log(
        `📚 Updated ${purchaseToProcess.bookOrders.length} book order(s) to 'processing' status`
      );
    }

    console.log(
      `✅ Processing successful payment for order: ${purchaseToProcess.orderNumber}`
    );

    // Get user with all necessary data
    const user = await User.findById(purchaseToProcess.user._id)
      .populate('purchasedBundles.bundle')
      .populate('purchasedCourses.course')
      .populate('enrolledCourses.course');

    if (!user) {
      throw new Error('User not found');
    }

    // Process user enrollments - CRITICAL: This must complete successfully
    for (const purchaseItem of purchaseToProcess.items) {
      // Normalize item ID - handle both populated and non-populated cases
      const itemId = purchaseItem.item._id ? purchaseItem.item._id : purchaseItem.item;
      
      if (purchaseItem.itemType === 'bundle') {
        await user.addPurchasedBundle(
          itemId,
          purchaseItem.price,
          purchaseToProcess.orderNumber
        );

        const bundle = await BundleCourse.findById(itemId).populate(
          'courses'
        );
        if (bundle) {
          await user.enrollInBundleCourses(bundle);
          console.log(`✅ Enrolled user in bundle: ${bundle.title}`);
        }
      } else {
        // Use atomic method to add purchase AND enrollment together
        // This prevents sync issues where purchase succeeds but enrollment fails
        const result = await user.addPurchasedCourseWithEnrollment(
          itemId,
          purchaseItem.price,
          purchaseToProcess.orderNumber
        );
        
        if (result.purchaseAdded || result.enrollmentAdded) {
          console.log(`✅ Processed course: ${purchaseItem.title} (purchase: ${result.purchaseAdded}, enrollment: ${result.enrollmentAdded})`);
        }
      }
    }

    // Handle promo code usage if applied
    if (purchaseToProcess.appliedPromoCode && purchaseToProcess.discountAmount > 0) {
      try {
        // Add promo code usage to user
        await user.addPromoCodeUsage(
          freshPurchase.appliedPromoCode,
          freshPurchase._id,
          freshPurchase.discountAmount,
          freshPurchase.originalAmount,
          freshPurchase.total
        );

        // Update promo code usage count and history
        const promoCode = await PromoCode.findById(
          purchaseToProcess.appliedPromoCode
        );
        if (promoCode) {
          // Add to usage history
          promoCode.usageHistory.push({
            user: purchaseToProcess.user._id,
            purchase: purchaseToProcess._id,
            discountAmount: purchaseToProcess.discountAmount,
            originalAmount: purchaseToProcess.originalAmount,
            finalAmount: purchaseToProcess.total,
            usedAt: new Date(),
          });

          // Increment current uses
          promoCode.currentUses += 1;
          await promoCode.save();

          console.log('Promo code usage tracked:', {
            code: promoCode.code,
            user: purchaseToProcess.user._id,
            purchase: purchaseToProcess._id,
            discountAmount: purchaseToProcess.discountAmount,
          });
        }
      } catch (error) {
        console.error('Error tracking promo code usage:', error);
      }
    }

    // Send library notification for book orders if they exist
    if (purchaseToProcess.bookOrders && purchaseToProcess.bookOrders.length > 0) {
      try {
        console.log(
          `📚 Initiating library notification for book orders: ${purchaseToProcess.orderNumber}`
        );

        const libraryResult = await sendLibraryBookOrderNotification(
          purchaseToProcess.bookOrders,
          user
        );
        if (libraryResult.success) {
          console.log(`✅ Library notification completed successfully`);
        } else {
          console.log(`⚠️ Library notification result:`, libraryResult.message);
        }
      } catch (libraryError) {
        console.error(`❌ Library notification error:`, libraryError);
        // Don't fail the payment if library notification fails
      }
    }

    // Clear cart and book-only purchase session after payment is confirmed completed
    if (req && req.session) {
      clearCart(req, 'payment completed');
      
      // Clear book-only purchase session
      if (req.session.bookOnlyPurchase) {
        delete req.session.bookOnlyPurchase;
        req.session.save();
      }

      // Track purchase completion
      const itemNames = purchaseToProcess.items.map(i => i.title).join(', ');
      PurchaseTracker.completed(req, purchaseToProcess._id.toString(), 
        purchaseToProcess.items[0]?.item?._id?.toString() || '', 
        itemNames, 
        purchaseToProcess.totalAmount,
        purchaseToProcess.paymentMethod || 'paymob'
      );
    }

    // Log system event
    logSystem('PURCHASE_COMPLETED', {
      orderId: purchaseToProcess.orderNumber,
      userId: purchaseToProcess.user?._id?.toString(),
      amount: purchaseToProcess.totalAmount,
      itemCount: purchaseToProcess.items.length,
    });

    console.log(
      `✅ Successfully processed payment and enrollment for order: ${purchaseToProcess.orderNumber}`
    );

    return { success: true, purchase: purchaseToProcess };
  } catch (error) {
    console.error('Error processing successful payment:', error);
    logError('Error processing successful payment', error);
    throw error;
  }
}

/**
 * Process failed payment - Centralized function for webhook and redirect handlers
 */
async function processFailedPayment(purchase, failureReason, paymentGatewayResponse = {}) {
  try {
    // Reload purchase to ensure we have latest data
    const freshPurchase = await Purchase.findById(purchase._id || purchase);

    if (!freshPurchase) {
      throw new Error('Purchase not found');
    }

    // Only process if status is pending (idempotency check)
    if (freshPurchase.status !== 'pending') {
      console.log(
        `⚠️ Purchase ${freshPurchase.orderNumber} already processed with status: ${freshPurchase.status}`
      );
      return { success: true, alreadyProcessed: true, purchase: freshPurchase };
    }

    // Update purchase status
    freshPurchase.status = 'failed';
    freshPurchase.paymentStatus = 'failed';
    freshPurchase.failureReason = failureReason || 'Payment declined or failed';
    freshPurchase.paymentGatewayResponse = paymentGatewayResponse;
    await freshPurchase.save();

    // Cancel any book orders associated with this failed purchase
    if (freshPurchase.bookOrders && freshPurchase.bookOrders.length > 0) {
      await BookOrder.updateMany(
        { _id: { $in: freshPurchase.bookOrders } },
        { status: 'cancelled' }
      );
      console.log(
        `📚 Cancelled ${freshPurchase.bookOrders.length} book order(s) for failed payment`
      );
    }

    console.log('💾 Failed purchase saved:', {
      orderNumber: freshPurchase.orderNumber,
      paymobTransactionId: freshPurchase.paymobTransactionId,
      paymobOrderId: freshPurchase.paymobOrderId,
      failureReason: freshPurchase.failureReason,
      status: freshPurchase.status,
    });

    // Log failed purchase
    logSystem('PURCHASE_FAILED', {
      orderId: freshPurchase.orderNumber,
      userId: freshPurchase.user?.toString(),
      amount: freshPurchase.totalAmount,
      failureReason: failureReason,
    });

    return { success: true, purchase: freshPurchase };
  } catch (error) {
    console.error('Error processing failed payment:', error);
    logError('Error processing failed payment', error);
    throw error;
  }
}

// Helper function to send WhatsApp notification to library for book orders
// Accepts book order IDs (string or ObjectId array)
// Sends notification directly without any tracking - called only on payment confirmation
async function sendLibraryBookOrderNotification(bookOrderIds, user) {
  try {
    console.log('\n📚 ========== LIBRARY NOTIFICATION ==========');
    console.log('📚 Book order IDs:', bookOrderIds);
    
    if (!bookOrderIds || bookOrderIds.length === 0) {
      console.log('❌ No book order IDs provided');
      return { success: false, message: 'No book orders to notify' };
    }

    // Convert to array if single ID
    const idsArray = Array.isArray(bookOrderIds) ? bookOrderIds : [bookOrderIds];
    
    // Convert all to strings for consistency
    const cleanIds = idsArray.map(id => {
      if (typeof id === 'string') return id;
      if (id._id) return id._id.toString();
      return id.toString();
    });
    
    console.log('📚 Cleaned IDs:', cleanIds);
    
    // Fetch BookOrder documents from database
    const BookOrder = require('../models/BookOrder');
    const bookOrders = await BookOrder.find({ _id: { $in: cleanIds } })
      .populate('bundle', 'title bundleCode');
    
    console.log(`📚 Found ${bookOrders.length} book orders in database`);
    
    if (bookOrders.length === 0) {
      console.log('❌ No book orders found in database');
      return { success: false, message: 'Book orders not found' };
    }
    
    const firstBookOrder = bookOrders[0];
    
    // Check if library notification was already sent for this purchase
    const Purchase = require('../models/Purchase');
    const purchase = await Purchase.findById(firstBookOrder.purchase);
    
    if (purchase && purchase.libraryNotificationSent) {
      console.log('⚠️ Library notification already sent for this purchase:', purchase.orderNumber);
      console.log('📚 Notification was sent at:', purchase.libraryNotificationSentAt);
      return { 
        success: true, 
        message: 'Library notification already sent', 
        alreadySent: true,
        sentAt: purchase.libraryNotificationSentAt
      };
    }
    
    // Validate shipping address
    if (!firstBookOrder.shippingAddress) {
      console.error('❌ Book order missing shippingAddress:', firstBookOrder._id);
      return { success: false, message: 'Book order missing shipping address' };
    }
    
    console.log('✓ Shipping address validated');

    // Get WhatsApp session API key
    const SESSION_API_KEY = process.env.WASENDER_SESSION_API_KEY || process.env.WHATSAPP_SESSION_API_KEY || '';
    if (!SESSION_API_KEY) {
      console.error('❌ WhatsApp session API key not configured');
      return { success: false, message: 'WhatsApp session API key not configured' };
    }
    console.log('✓ API key found');

    // Determine library phone number based on country
    const country = firstBookOrder.shippingAddress?.country || '';
    console.log(`📚 Shipping country: ${country}`);
    const isEgypt = country.toLowerCase().includes('egypt') || country.toLowerCase().includes('مصر') || country === 'EG' || country === 'Egypt';
    console.log(`📚 Is Egypt: ${isEgypt}`);
    
    // Library phone numbers - Both Egypt and International use same number
        // Library phone numbers (local Egyptian format, will be converted to international format)
    const egyptLibraryPhone = '01026652507'; // Egypt library
    const internationalLibraryPhone = '01026652507'; // International library
    const libraryPhone = isEgypt ? egyptLibraryPhone : internationalLibraryPhone;

    // Format phone number for WhatsApp
    const formatPhoneForWhatsApp = (phone) => {
      const cleaned = phone.replace(/\D/g, '');
      if (cleaned.startsWith('0')) {
        return `20${cleaned.substring(1)}`;
      }
      if (!cleaned.startsWith('20') && !cleaned.startsWith('+')) {
        return `20${cleaned}`;
      }
      return cleaned.replace(/^\+/, '');
    };

    const formattedLibraryPhone = formatPhoneForWhatsApp(libraryPhone);
    const libraryJid = `${formattedLibraryPhone}@s.whatsapp.net`;
    console.log(`📚 Library WhatsApp JID: ${libraryJid}`);

    // Helper function to format phone number with country code
    const formatPhoneNumber = (countryCode, phoneNumber) => {
      if (!phoneNumber || phoneNumber === 'N/A') return 'N/A';
      if (!countryCode) return phoneNumber;
      // Ensure country code has + sign
      const code = countryCode.startsWith('+') ? countryCode : `+${countryCode}`;
      return `${code}${phoneNumber}`;
    };

    // Build WhatsApp message
    let message = '📚 *طلب جديد*\n\n';
    message += '═══════════════════\n\n';
    
    // Add order details for each book
    for (let i = 0; i < bookOrders.length; i++) {
      const bookOrder = bookOrders[i];
      message += `*رقم الطلب:* ${bookOrder.orderNumber || 'N/A'}\n`;
      message += `*معرف الطلب:* ${bookOrder._id}\n`;
      message += `*اسم الكتاب:* ${bookOrder.bookName || 'N/A'}\n`;
      message += `*اسم الكورس:* ${bookOrder.bundle?.title || 'N/A'}\n`;
      message += `*سعر الكتاب:* ${bookOrder.bookPrice || 0} جنيه\n`;
      if (i < bookOrders.length - 1) {
        message += '\n';
      }
    }

    message += '\n';

    // Add shipping address
    if (firstBookOrder.shippingAddress) {
      const address = firstBookOrder.shippingAddress;
      message += '*عنوان الشحن:*\n';
      message += `*الاسم:* ${(address.firstName || '').trim()} ${(address.lastName || '').trim()}\n`;
      message += `*البريد الإلكتروني:* ${address.email || 'N/A'}\n`;
      message += `*رقم الهاتف:* ${address.phone || 'N/A'}\n`;
      
      // Street address details
      if (address.streetName) {
        message += `*اسم الشارع:* ${address.streetName.trim()}\n`;
      }
      if (address.buildingNumber) {
        message += `*رقم المبنى:* ${address.buildingNumber}\n`;
      }
      if (address.apartmentNumber) {
        message += `*رقم الشقة:* ${address.apartmentNumber}\n`;
      }
      
      // Governorate (if exists)
      if (address.governorate) {
        message += `*المحافظة:* ${address.governorate}\n`;
      }
      
      // Zone/City (use city field, not state)
      if (address.city) {
        message += `*المنطقة:* ${address.city}\n`;
      }
      message += `*البلد:* ${address.country || 'N/A'}\n`;
      // if (address.zipCode) {
      //   message += `*الرمز البريدي:* ${address.zipCode}\n`;
      // }
      
      // Location on map with Google Maps link
      if (address.location && (address.location.link || (address.location.lat && address.location.lng))) {
        const mapsLink = address.location.link || `https://www.google.com/maps?q=${address.location.lat},${address.location.lng}`;
        message += `\n*📍 موقع التوصيل:* ${mapsLink}\n`;
      }
      
      message += '\n';
    }

    // Add student and parent contact info
    if (user) {
      message += '*معلومات الطالب والوالد:*\n';
      message += `*اسم الطالب:* ${(user.firstName || '').trim()} ${(user.lastName || '').trim()}\n`;
      const studentPhone = formatPhoneNumber(user.studentCountryCode, user.studentNumber);
      message += `*رقم هاتف الطالب:* ${studentPhone}\n`;
      const parentPhone = formatPhoneNumber(user.parentCountryCode, user.parentNumber);
      message += `*رقم هاتف الوالد:* ${parentPhone}\n`;
    }

    message += '═══════════════════\n';
    // Format date in Arabic
    const date = new Date();
    const arabicMonths = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    const day = date.getDate();
    const month = arabicMonths[date.getMonth()];
    const year = date.getFullYear();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const period = hour >= 12 ? 'م' : 'ص';
    const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
    message += `*التاريخ:* ${day} ${month} ${year} في ${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}\n`;
    
    console.log('📚 Message built - length:', message.length, 'characters');

    // Send WhatsApp message
    console.log(`📚 Sending to ${isEgypt ? 'Egypt' : 'International'} Library: ${libraryJid}`);
    
    const result = await wasender.sendTextMessage(SESSION_API_KEY, libraryJid, message);
    
    console.log('📚 WhatsApp API Response:', JSON.stringify(result, null, 2));

    if (result.success) {
      // Mark library notification as sent in Purchase document
      if (purchase) {
        purchase.libraryNotificationSent = true;
        purchase.libraryNotificationSentAt = new Date();
        await purchase.save();
        console.log('✅ Purchase marked with library notification sent flag');
      }
      
      console.log('✅ Library notification sent successfully!');
      console.log('📚 ========== END LIBRARY NOTIFICATION (SUCCESS) ==========\n');
      return { 
        success: true, 
        message: 'Library notification sent successfully', 
        libraryPhone: formattedLibraryPhone,
        orderCount: bookOrders.length
      };
    } else {
      console.error('❌ WhatsApp API returned failure:', result.message);
      console.log('📚 ========== END LIBRARY NOTIFICATION (FAILED) ==========\n');
      return { 
        success: false, 
        message: result.message || 'Failed to send library notification',
        error: result.error
      };
    }
  } catch (error) {
    console.error('\n❌ ========== LIBRARY NOTIFICATION CRASHED ==========');
    console.error('❌ Error:', error.message);
    console.error('❌ Stack:', error.stack);
    console.error('❌ ========== END ERROR ==========\n');
    return { 
      success: false, 
      message: error.message || 'Error sending library notification',
      error: error.name
    };
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
    // Check if this is a book-only purchase - skip cart validation
    const isBookOnly = req.session.bookOnlyPurchase;
    
    if (isBookOnly) {
      // For book-only purchases, set validated cart to empty but allow it
      req.validatedCart = {
        items: [],
        subtotal: 0,
        total: 0,
        cartCount: 0,
        isBookOnly: true, // Flag to indicate book-only purchase
      };
      console.log('Book-only purchase detected, skipping cart validation');
      return next();
    }

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
        isBookOnly: false,
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
        isBookOnly: false,
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
      isBookOnly: false,
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

    const { promoCode, booksSubtotal = 0 } = req.body;
    const validatedCart = req.validatedCart;

    if (!promoCode) {
      return res.status(400).json({
        success: false,
        message: 'Promo code is required',
      });
    }

    // For book-only purchases or regular cart with books, include books in total
    const isBookOnly = validatedCart.isBookOnly;
    
    // Allow promo code validation for book-only purchases or regular cart
    if (validatedCart.cartCount === 0 && !isBookOnly && booksSubtotal <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
      });
    }

    // Calculate total amount including books
    const parsedBooksSubtotal = parseFloat(booksSubtotal) || 0;
    const totalAmount = validatedCart.subtotal + parsedBooksSubtotal;

    // Create items array that includes books for promo validation
    const itemsForPromo = [...validatedCart.items];
    if (parsedBooksSubtotal > 0) {
      // Add a dummy book item for promo validation
      itemsForPromo.push({
        id: 'books',
        type: 'book',
        title: 'Selected Books',
        price: parsedBooksSubtotal,
      });
    }

    const result = await validateAndApplyPromoCode(
      promoCode,
      req.session.user.id,
      itemsForPromo,
      totalAmount, // Use total including books
      req.session.user.email || req.session.user.studentEmail
    );

    if (result.success) {
      // Store promo code in session for checkout (with total including books)
      req.session.appliedPromoCode = {
        code: result.promoCode.code,
        id: result.promoCode._id,
        discountAmount: result.discountAmount,
        finalAmount: result.finalAmount,
        originalAmount: result.originalAmount,
        booksSubtotal: parsedBooksSubtotal, // Store books subtotal for verification
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

// Direct book purchase checkout - for students who already purchased bundle but not the book
const getBookCheckout = async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login to proceed to checkout');
      return res.redirect('/auth/login');
    }

    const bundleId = req.query.bundle;
    if (!bundleId) {
      req.flash('error_msg', 'Bundle ID is required');
      return res.redirect('/student/enrolled-courses');
    }

    const user = await User.findById(req.session.user.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/auth/login');
    }

    // Check if user has purchased the bundle
    if (!user.hasPurchasedBundle(bundleId)) {
      req.flash('error_msg', 'You must purchase the bundle first before buying the book');
      return res.redirect('/student/enrolled-courses');
    }

    // Check if user has already ordered the book
    const hasOrderedBook = await BookOrder.hasUserOrderedBook(
      user._id,
      bundleId
    );

    if (hasOrderedBook) {
      req.flash('error_msg', 'You have already purchased this book');
      return res.redirect('/student/enrolled-courses');
    }

    // Get bundle details
    const bundle = await BundleCourse.findById(bundleId)
      .select('_id title bundleCode hasBook bookName bookPrice thumbnail');

    if (!bundle || !bundle.hasBook || bundle.bookPrice <= 0) {
      req.flash('error_msg', 'Book is not available for this bundle');
      return res.redirect('/student/enrolled-courses');
    }

    // Clear cart and set up book-only purchase
    req.session.cart = [];
    
    // Create a book-only cart item (we'll handle this specially in checkout)
    req.session.bookOnlyPurchase = {
      bundleId: bundle._id.toString(),
      bundleTitle: bundle.title,
      bundleCode: bundle.bundleCode,
      bookName: bundle.bookName,
      bookPrice: bundle.bookPrice,
      thumbnail: bundle.thumbnail || '/images/bundle-placeholder.jpg',
    };

    // Save session before redirect to ensure it's persisted
    req.session.save((err) => {
      if (err) {
        console.error('Error saving session in getBookCheckout:', err);
      }
      // Redirect to checkout with book-only flag
      return res.redirect('/purchase/checkout?bookOnly=true');
    });
  } catch (error) {
    console.error('Error in getBookCheckout:', error);
    req.flash('error_msg', 'Error loading book checkout');
    return res.redirect('/student/enrolled-courses');
  }
};

// Get checkout page
const getCheckout = async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login to proceed to checkout');
      return res.redirect('/auth/login');
    }

    // Check if this is a book-only purchase (check session first, then query param)
    // Session is the source of truth, query param is just for the redirect
    const isBookOnly = req.session.bookOnlyPurchase && (req.query.bookOnly === 'true' || req.session.bookOnlyPurchase);
    
    if (isBookOnly) {
      // Handle book-only checkout
      const bookPurchase = req.session.bookOnlyPurchase;
      
      // Validate the book purchase is still valid
      const user = await User.findById(req.session.user.id);
      if (!user.hasPurchasedBundle(bookPurchase.bundleId)) {
        delete req.session.bookOnlyPurchase;
        req.flash('error_msg', 'You must purchase the bundle first before buying the book');
        return res.redirect('/student/enrolled-courses');
      }

      const hasOrderedBook = await BookOrder.hasUserOrderedBook(
        user._id,
        bookPurchase.bundleId
      );

      if (hasOrderedBook) {
        delete req.session.bookOnlyPurchase;
        req.flash('error_msg', 'You have already purchased this book');
        return res.redirect('/student/enrolled-courses');
      }

      // Render checkout with book-only data
      const availableBooks = [{
        bundleId: bookPurchase.bundleId,
        bundleTitle: bookPurchase.bundleTitle,
        bundleCode: bookPurchase.bundleCode,
        bookName: bookPurchase.bookName,
        bookPrice: bookPurchase.bookPrice,
        thumbnail: bookPurchase.thumbnail,
      }];

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

      return res.render('checkout', {
        title: 'Book Checkout | ELKABLY',
        theme: req.cookies.theme || 'light',
        cart: [], // Empty cart for book-only purchase
        subtotal: bookPurchase.bookPrice,
        total: bookPurchase.bookPrice,
        user: req.session.user,
        availableBooks: availableBooks,
        appliedPromoCode: appliedPromo,
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
        isBookOnly: true, // Flag to indicate book-only purchase
        bookPurchaseInfo: bookPurchase, // Pass book info
        paymentMethods: {
          card: !!process.env.PAYMOB_INTEGRATION_ID_CARD,
          wallet: !!process.env.PAYMOB_INTEGRATION_ID_WALLET,
          kiosk: !!process.env.PAYMOB_INTEGRATION_ID_KIOSK,
          applePay: !!process.env.PAYMOB_INTEGRATION_ID_APPLE_PAY,
        },
      });
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

    // Don't redirect if this is a book-only purchase (check both query param and session)
    const isBookOnlyRequest = req.query.bookOnly === 'true' || req.session.bookOnlyPurchase;
    
    if (validatedCart.cartCount === 0 && !isBookOnlyRequest) {
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
      isBookOnly: false, // Regular checkout, not book-only
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '', // Pass Google Maps API key
      // Payment method availability
      paymentMethods: {
        card: !!process.env.PAYMOB_INTEGRATION_ID_CARD,
        wallet: !!process.env.PAYMOB_INTEGRATION_ID_WALLET,
        kiosk: !!process.env.PAYMOB_INTEGRATION_ID_KIOSK,
        applePay: !!process.env.PAYMOB_INTEGRATION_ID_APPLE_PAY,
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
        // Use atomic method to add purchase AND enrollment together
        const result = await user.addPurchasedCourseWithEnrollment(
          item.id,
          item.price, // Database-validated price
          purchase.orderNumber
        );
        
        if (result.purchaseAdded || result.enrollmentAdded) {
          console.log(`✅ Direct checkout - course processed: ${item.title}`);
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

    // Check if this is a book-only purchase
    const isBookOnly = req.session.bookOnlyPurchase;
    let validatedCart = req.validatedCart;
    let selectedBooks = [];

    if (isBookOnly) {
      // Handle book-only purchase
      const bookPurchase = req.session.bookOnlyPurchase;
      const user = await User.findById(req.session.user.id);

      // Validate user has purchased the bundle
      if (!user.hasPurchasedBundle(bookPurchase.bundleId)) {
        delete req.session.bookOnlyPurchase;
        return res.status(400).json({
          success: false,
          message: 'You must purchase the bundle first before buying the book',
        });
      }

      // Validate user hasn't already ordered the book
      const hasOrderedBook = await BookOrder.hasUserOrderedBook(
        user._id,
        bookPurchase.bundleId
      );

      if (hasOrderedBook) {
        delete req.session.bookOnlyPurchase;
        return res.status(400).json({
          success: false,
          message: 'You have already purchased this book',
        });
      }

      // Set up book-only cart structure
      validatedCart = {
        items: [],
        subtotal: bookPurchase.bookPrice,
        total: bookPurchase.bookPrice,
        cartCount: 0,
      };

      // Mark the book as selected
      selectedBooks = [bookPurchase.bundleId];
    } else {
      // Use validated cart data from middleware
      validatedCart = req.validatedCart;

      if (validatedCart.cartCount === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cart is empty or contains invalid items',
        });
      }

      // Get selected books from form
      const { selectedBooks: formSelectedBooks } = req.body;
      if (formSelectedBooks && Array.isArray(formSelectedBooks)) {
        selectedBooks = formSelectedBooks;
      } else if (formSelectedBooks) {
        selectedBooks = [formSelectedBooks];
      }
    }

    // Skip cart validation for book-only purchases
    if (!isBookOnly) {
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

    // Handle book orders first to get correct subtotal for promo code calculation
    let booksSubtotal = 0;
    const bookOrders = [];

    if (isBookOnly) {
      // For book-only purchase, use the book price from session
      booksSubtotal = req.session.bookOnlyPurchase.bookPrice;
    } else {
      // Get selected books from form
      const formSelectedBooks = req.body.selectedBooks || [];
      if (formSelectedBooks.length > 0) {
        // Validate and calculate book prices
        const bundles = await BundleCourse.find({
          _id: { $in: formSelectedBooks },
          hasBook: true,
          bookPrice: { $gt: 0 },
        }).select('_id bookName bookPrice');

        for (const bundle of bundles) {
          booksSubtotal += bundle.bookPrice;
        }
      }
    }

    // Calculate base subtotal (cart items + books)
    const baseSubtotal = isBookOnly 
      ? booksSubtotal 
      : validatedCart.subtotal + booksSubtotal;

    // Handle promo code if applied - SECURITY: Always recalculate from server
    let finalSubtotal = baseSubtotal;
    let finalTotal = baseSubtotal;
    let appliedPromoCode = null;
    let discountAmount = 0;

    if (req.session.appliedPromoCode) {
      // For book-only purchases, create a dummy item for promo validation
      const itemsForPromo = isBookOnly 
        ? [{
            id: req.session.bookOnlyPurchase.bundleId,
            type: 'book',
            title: req.session.bookOnlyPurchase.bookName,
            price: booksSubtotal,
          }]
        : validatedCart.items;

      // SECURITY: Re-validate promo code and recalculate amounts from server
      const promoValidation = await validateAndApplyPromoCode(
        req.session.appliedPromoCode.code,
        req.session.user.id,
        itemsForPromo,
        baseSubtotal,
        req.session.user.email || req.session.user.studentEmail
      );

      if (promoValidation.success) {
        appliedPromoCode = promoValidation.promoCode;
        discountAmount = promoValidation.discountAmount;
        finalSubtotal = baseSubtotal; // Keep original subtotal (with books)
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
          originalAmount: baseSubtotal,
          discountAmount: discountAmount,
          finalAmount: finalTotal,
          promoCode: appliedPromoCode.code,
          isBookOnly: !!isBookOnly,
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

    // Final total is already calculated (includes books and promo discount)
    const totalWithBooks = finalTotal;

    // Create purchase record with pending status using validated cart data
    const purchaseItems = isBookOnly 
      ? [] // Empty items for book-only purchase
      : validatedCart.items.map((item) => ({
          itemType: item.type,
          itemTypeModel: item.type === 'bundle' ? 'BundleCourse' : 'Course',
          item: item.id,
          title: item.title,
          price: item.price, // Database-validated price
          quantity: 1,
        }));

    const purchase = new Purchase({
      user: req.session.user.id,
      items: purchaseItems,
      // For book-only purchases, finalSubtotal already includes booksSubtotal
      // For regular purchases, we need to add booksSubtotal to finalSubtotal
      subtotal: isBookOnly ? finalSubtotal : (finalSubtotal + booksSubtotal),
      total: totalWithBooks,
      booksSubtotal: booksSubtotal,
      currency: 'EGP',
      paymentMethod: 'paymob',
      billingAddress,
      status: 'pending',
      paymentStatus: 'pending',
      paymentIntentId: merchantOrderId,
      isBookOnly: !!isBookOnly, // Flag to indicate book-only purchase
      // Add promo code information
      appliedPromoCode: appliedPromoCode ? appliedPromoCode._id : null,
      discountAmount: discountAmount,
      originalAmount: isBookOnly ? booksSubtotal : validatedCart.subtotal,
      promoCodeUsed: appliedPromoCode ? appliedPromoCode.code : null,
    });

    await purchase.save();

    // Create book orders if books were selected (or if book-only purchase)
    const bookBundleIds = isBookOnly 
      ? [req.session.bookOnlyPurchase.bundleId]
      : selectedBooks;

    if (bookBundleIds.length > 0) {
      const bundles = await BundleCourse.find({
        _id: { $in: bookBundleIds },
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
    const orderItems = isBookOnly 
      ? [] // Empty items for book-only purchase
      : validatedCart.items.map((item) => ({
          title: item.title,
          price: item.price, // Database-validated price
          quantity: 1,
          description: `${item.type === 'bundle' ? 'Bundle' : 'Course'}: ${
            item.title
          }`,
        }));

    // Add book items to order
    if (bookBundleIds.length > 0) {
      const bundles = await BundleCourse.find({
        _id: { $in: bookBundleIds },
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

    // DON'T clear book-only purchase session here - wait until payment is completed
    // The session will be cleared in processSuccessfulPayment after payment is confirmed

    // Log payment data for debugging
    console.log('Creating payment session with data:', {
      isBookOnly: !!isBookOnly,
      originalSubtotal: isBookOnly ? booksSubtotal : validatedCart.subtotal,
      booksSubtotal: booksSubtotal,
      finalTotal: totalWithBooks,
      discountAmount: discountAmount,
      promoCode: appliedPromoCode ? appliedPromoCode.code : 'none',
      merchantOrderId: merchantOrderId,
      booksCount: bookBundleIds.length,
    });

    // Handle zero-payment orders (100% discount)
    if (totalWithBooks <= 0) {
      console.log('💯 Zero payment order detected - completing order directly without payment gateway');
      
      try {
        // Process the successful payment directly
        const result = await processSuccessfulPayment(purchase, req);
        
        if (result.success) {
          console.log(`✅ Zero-payment order completed successfully: ${purchase.orderNumber}`);
          
          // Clear cart and book-only purchase session
          clearCart(req, 'zero payment order');
          if (req.session.bookOnlyPurchase) {
            delete req.session.bookOnlyPurchase;
          }
          // Clear applied promo code from session
          if (req.session.appliedPromoCode) {
            delete req.session.appliedPromoCode;
          }
          
          // Save session
          req.session.save();
          
          return res.json({
            success: true,
            message: 'Order completed successfully with 100% discount!',
            skipPayment: true, // Flag to tell frontend to skip payment iframe
            paymentData: {
              orderNumber: purchase.orderNumber,
              total: 0,
              currency: 'EGP',
            },
          });
        } else {
          throw new Error(result.error || 'Failed to process zero-payment order');
        }
      } catch (zeroPaymentError) {
        console.error('Error processing zero-payment order:', zeroPaymentError);
        
        // Update purchase status to failed
        purchase.status = 'failed';
        purchase.paymentStatus = 'failed';
        purchase.failureReason = 'Zero-payment order processing failed';
        await purchase.save();
        
        // Cancel book orders
        if (purchase.bookOrders && purchase.bookOrders.length > 0) {
          await BookOrder.updateMany(
            { _id: { $in: purchase.bookOrders } },
            { status: 'cancelled' }
          );
        }
        
        return res.status(500).json({
          success: false,
          message: 'Error completing your order. Please try again.',
        });
      }
    }

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

    // Store paymob intention ID on purchase for unified checkout payments
    // This provides another reliable way to find the purchase in webhook
    if (paymentSession.intentionId) {
      purchase.paymobIntentionId = paymentSession.intentionId;
      await purchase.save();
      console.log(`💾 Stored Paymob Intention ID: ${paymentSession.intentionId} on purchase ${purchase.orderNumber}`);
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

// Handle payment success - NOW ONLY READS FROM DB (webhook processes payment)
const handlePaymentSuccess = async (req, res) => {
  try {
    // Handle both direct merchant order ID and Paymob redirect parameters
    let merchantOrderId =
      req.query.merchantOrderId || req.query.merchant_order_id;
    
    // Also accept orderNumber for zero-payment orders (100% discount)
    const orderNumber = req.query.orderNumber;

    // If no merchant order ID in query, check if this is a Paymob redirect
    if (!merchantOrderId && req.query.success === 'true') {
      merchantOrderId = req.query.merchant_order_id;
    }

    // Find purchase by merchant order ID or order number
    let purchase = null;
    
    if (orderNumber) {
      // Zero-payment order - find by order number
      purchase = await Purchase.findOne({
        orderNumber: orderNumber,
      })
        .populate('items.item')
        .populate('user');
    } else if (merchantOrderId) {
      // Normal Paymob payment - find by merchant order ID
      purchase = await Purchase.findOne({
        paymentIntentId: merchantOrderId,
      })
        .populate('items.item')
        .populate('user');
    }

    if (!purchase) {
      console.error('Payment success: Purchase not found');
      return res.render('payment-fail', {
        title: 'Payment Error | ELKABLY',
        theme: req.cookies.theme || 'light',
        message: 'Payment record not found',
      });
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

    // If already completed, just show success page
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

          purchase.whatsappNotificationSent = true;
          await purchase.save();
          console.log('✅ WhatsApp notification sent and marked as sent');
        } catch (whatsappError) {
          console.error('❌ WhatsApp notification error:', whatsappError);
        }
      }

      // Populate book orders if they exist
      const purchaseObj = purchase.toObject();
      if (purchaseObj.bookOrders && purchaseObj.bookOrders.length > 0) {
        const bookOrders = await BookOrder.find({
          _id: { $in: purchaseObj.bookOrders },
        })
          .populate('bundle', 'title bundleCode')
          .lean();
        purchaseObj.bookOrders = bookOrders || [];
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

    // If purchase is still pending, try Transaction Inquiry as fallback
    // (Webhook might not have arrived yet)
    if (purchase.status === 'pending' || purchase.paymentStatus === 'pending') {
      console.log(
        '⏳ Purchase still pending, checking with Paymob Transaction Inquiry...'
      );

      try {
        // Use all available IDs for better lookup
        const transactionStatus = await paymobService.queryTransactionStatus(
          merchantOrderId,
          purchase.paymobOrderId,
          purchase.paymobTransactionId
        );

        if (transactionStatus) {
          const webhookData =
            paymobService.processWebhookPayload(transactionStatus);

          // If payment is successful, process it now
          if (webhookData.isSuccess) {
            console.log(
              '✅ Transaction Inquiry: Payment successful, processing now...'
            );

            // Save Paymob transaction details
            if (webhookData.transactionId) {
              purchase.paymobTransactionId = String(webhookData.transactionId);
            }
            purchase.paymentGatewayResponse = webhookData.rawPayload;
            await purchase.save();

            // Process successful payment using centralized function
            // Pass req to clear session after payment is confirmed completed
            await processSuccessfulPayment(purchase, req);

            // Reload purchase to get updated data
            purchase = await Purchase.findOne({
              paymentIntentId: merchantOrderId,
            })
              .populate('items.item')
              .populate('user');
          } else if (webhookData.isFailed) {
            console.log(
              '❌ Transaction Inquiry: Payment failed, processing now...'
            );

            const failureReason =
              transactionStatus?.obj?.data?.message ||
              transactionStatus?.data?.message ||
              'Payment declined or failed';

            await processFailedPayment(
              purchase,
              failureReason,
              webhookData.rawPayload
            );

            return res.render('payment-fail', {
              title: 'Payment Failed | ELKABLY',
              theme: req.cookies.theme || 'light',
              message:
                'Payment was not successful. Please try again or contact support.',
            });
          }
        }
      } catch (verifyError) {
        console.warn(
          'Could not verify transaction status:',
          verifyError.message
        );
        // Continue to show pending message
      }

      // If still pending after inquiry, show processing page (not fail page)
      if (purchase.status === 'pending') {
        return res.render('payment-processing', {
          title: 'Payment Processing | ELKABLY',
          theme: req.cookies.theme || 'light',
          merchantOrderId: merchantOrderId,
          orderNumber: purchase.orderNumber,
        });
      }
    }

    // Only clear cart if payment is actually completed
    // Don't clear if still pending - user might come back to complete payment
    if (purchase.status === 'completed' && purchase.paymentStatus === 'completed') {
      clearCart(req, 'payment success page');
      
      // Also clear book-only purchase session if it exists
      if (req.session.bookOnlyPurchase) {
        delete req.session.bookOnlyPurchase;
        req.session.save();
      }
    }

    // Populate book orders if they exist
    const purchaseObj = purchase.toObject();
    if (purchaseObj.bookOrders && purchaseObj.bookOrders.length > 0) {
      const bookOrders = await BookOrder.find({
        _id: { $in: purchaseObj.bookOrders },
      })
        .populate('bundle', 'title bundleCode')
        .lean();
      purchaseObj.bookOrders = bookOrders || [];
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

    // Clear cart on error
    clearCart(req, 'payment success error');

    res.render('payment-fail', {
      title: 'Payment Error - Mr Kably',
      theme: req.cookies.theme || 'light',
      message: 'An error occurred while processing your payment',
    });
  }
};

// Handle payment failure - NOW ONLY READS FROM DB (webhook processes payment)
const handlePaymentFailure = async (req, res) => {
  try {
    const { merchantOrderId, reason, transactionId, orderId } = req.query;

    // Clear the cart after failed payment
    clearCart(req, 'payment failed');

    // If merchantOrderId is provided, check DB status
    if (merchantOrderId) {
      const purchase = await Purchase.findOne({
        paymentIntentId: merchantOrderId,
      });

      if (purchase) {
        // If purchase is already marked as failed by webhook, just show failure page
        if (purchase.status === 'failed' || purchase.paymentStatus === 'failed') {
          const errorMessage =
            purchase.failureReason ||
            reason
              ? decodeURIComponent(reason)
              : 'Your payment could not be processed. Please try again or contact support.';

          return res.render('payment-fail', {
            title: 'Payment Failed - Mr Kably',
            theme: req.cookies.theme || 'light',
            message: errorMessage,
          });
        }

        // If purchase is still pending, webhook might not have arrived yet
        // Try Transaction Inquiry as fallback
        if (purchase.status === 'pending') {
          console.log(
            '⏳ Purchase still pending, checking with Paymob Transaction Inquiry...'
          );

          try {
            const transactionStatus = await paymobService.queryTransactionStatus(
              merchantOrderId
            );

            if (transactionStatus) {
              const webhookData =
                paymobService.processWebhookPayload(transactionStatus);

              if (webhookData.isFailed) {
                const failureReason =
                  transactionStatus?.obj?.data?.message ||
                  transactionStatus?.data?.message ||
                  reason
                    ? decodeURIComponent(reason)
                    : 'Payment declined or failed';

                // Save Paymob IDs if available
                if (transactionId) {
                  purchase.paymobTransactionId = String(transactionId);
                }
                if (orderId) {
                  purchase.paymobOrderId = String(orderId);
                }

                await processFailedPayment(
                  purchase,
                  failureReason,
                  webhookData.rawPayload
                );

                return res.render('payment-fail', {
                  title: 'Payment Failed - Mr Kably',
                  theme: req.cookies.theme || 'light',
                  message: failureReason,
                });
              } else if (webhookData.isSuccess) {
                // Payment actually succeeded! Redirect to success page
                return res.redirect(
                  `/purchase/payment/success?merchantOrderId=${merchantOrderId}`
                );
              }
            }
          } catch (verifyError) {
            console.warn(
              'Could not verify transaction status:',
              verifyError.message
            );
          }
        }
      }
    }

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

// Handle Paymob webhook - ROBUST VERSION - SINGLE SOURCE OF TRUTH
// This is THE definitive handler for payment processing
// Even if user closes browser, navigates away, or has network issues,
// the webhook will complete the purchase in the background
const handlePaymobWebhook = async (req, res) => {
  let purchase = null;
  const startTime = Date.now();
  
  // Immediately acknowledge webhook receipt to Paymob
  // This prevents timeout/retry issues
  res.status(200).send('OK');
  
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
        console.warn('❌ [Webhook] Signature verification failed - but will process anyway for safety');
        // Don't return - continue processing to avoid missing valid payments
      }
    }

    const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;

    // Comprehensive logging for debugging
    console.log('\n==========================================');
    console.log('📥 [Webhook] PAYMOB WEBHOOK RECEIVED');
    console.log('==========================================');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Transaction ID:', payload?.obj?.id || payload?.id);
    console.log('Merchant Order ID:', payload?.obj?.order?.merchant_order_id || payload?.merchant_order_id);
    console.log('Paymob Order ID:', payload?.obj?.order?.id || payload?.obj?.order);
    console.log('Intention ID:', payload?.obj?.intention?.id || payload?.intention?.id || payload?.obj?.intention_id || 'NOT PRESENT');
    console.log('Special Reference:', payload?.obj?.special_reference || payload?.special_reference || 'NOT PRESENT');
    console.log('Extras:', JSON.stringify(payload?.obj?.extras || payload?.extras || {}));
    console.log('Payment Key Claims Extras:', JSON.stringify(payload?.obj?.payment_key_claims?.extra || {}));
    console.log('Success Flag:', payload?.obj?.success);
    console.log('Is Success:', payload?.obj?.is_success);
    console.log('Transaction Status:', payload?.obj?.transaction_status || payload?.transaction_status);
    console.log('Amount (cents):', payload?.obj?.amount_cents);
    console.log('Paid Amount (cents):', payload?.obj?.order?.paid_amount_cents);
    console.log('==========================================\n');

    // Verify HMAC for transaction data (recommended by Paymob)
    const hmacValid = paymobService.verifyTransactionHMAC(payload);
    if (!hmacValid) {
      console.warn('⚠️ [Webhook] HMAC verification failed - processing anyway');
      // Continue processing - don't miss valid payments
    }

    // Process webhook payload with query parameters
    const webhookData = paymobService.processWebhookPayload(payload, req.query);

    // ENHANCED PURCHASE LOOKUP - Multiple fallback strategies
    const transactionId = String(payload?.obj?.id || payload?.id || '');
    const paymobOrderId = String(webhookData.paymobOrderId || payload?.obj?.order?.id || payload?.obj?.order || '');
    const webhookIntentionId = payload?.obj?.intention?.id || 
                               payload?.intention?.id || 
                               payload?.obj?.intention_id ||
                               payload?.intention_id || '';
    
    console.log('🔍 [Webhook] Looking up purchase with:');
    console.log('  - Merchant Order ID:', webhookData.merchantOrderId);
    console.log('  - Transaction ID:', transactionId);
    console.log('  - Paymob Order ID:', paymobOrderId);
    console.log('  - Intention ID:', webhookIntentionId || 'NOT PRESENT');

    // Strategy 1: Find by merchant order ID (paymentIntentId)
    if (webhookData.merchantOrderId) {
      purchase = await Purchase.findOne({
        paymentIntentId: webhookData.merchantOrderId,
      }).populate('user');
      if (purchase) {
        console.log('✅ [Webhook] Found purchase by merchant order ID');
      }
    }

    // Strategy 2: Find by Paymob transaction ID
    if (!purchase && transactionId) {
      purchase = await Purchase.findOne({
        paymobTransactionId: transactionId,
      }).populate('user');
      if (purchase) {
        console.log('✅ [Webhook] Found purchase by transaction ID:', transactionId);
      }
    }

    // Strategy 3: Find by Paymob order ID
    if (!purchase && paymobOrderId) {
      purchase = await Purchase.findOne({
        paymobOrderId: paymobOrderId,
      }).populate('user');
      if (purchase) {
        console.log('✅ [Webhook] Found purchase by Paymob order ID:', paymobOrderId);
      }
    }

    // Strategy 3.5: Find by Paymob intention ID (for unified checkout/wallet payments)
    // The intention ID might be in various places in the webhook payload
    const intentionId = payload?.obj?.intention?.id || 
                        payload?.intention?.id || 
                        payload?.obj?.intention_id ||
                        payload?.intention_id;
    if (!purchase && intentionId) {
      purchase = await Purchase.findOne({
        paymobIntentionId: String(intentionId),
      }).populate('user');
      if (purchase) {
        console.log('✅ [Webhook] Found purchase by Paymob intention ID:', intentionId);
      }
    }

    // Strategy 4: For successful payments, find the most recent pending purchase with matching amount
    // This is a last resort for wallet payments where merchant_order_id might not be in webhook
    // IMPORTANT: With the root cause fix (merchant_order_id at root level), this should rarely be needed
    if (!purchase && webhookData.isSuccess) {
      const amountInEGP = (payload?.obj?.amount_cents || 0) / 100;
      console.log('🔍 [Webhook] Trying amount-based lookup for:', amountInEGP, 'EGP');
      
      // Find recent pending purchases with matching amount (within last 30 minutes)
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      
      const pendingPurchases = await Purchase.find({
        status: 'pending',
        paymentStatus: 'pending',
        total: amountInEGP,
        createdAt: { $gte: thirtyMinutesAgo },
        paymentIntentId: { $exists: true, $ne: null },
      })
        .populate('user')
        .sort({ createdAt: -1 })
        .limit(5);

      if (pendingPurchases.length === 1) {
        // Only use if exactly one match to avoid confusion
        purchase = pendingPurchases[0];
        console.log('✅ [Webhook] Found purchase by amount match:', purchase.orderNumber);
      } else if (pendingPurchases.length > 1) {
        console.log(`⚠️ [Webhook] Multiple pending purchases (${pendingPurchases.length}) with amount ${amountInEGP}`);
        console.log('Pending purchases:', pendingPurchases.map(p => ({
          orderNumber: p.orderNumber, 
          paymentIntentId: p.paymentIntentId,
          paymobIntentionId: p.paymobIntentionId,
          userPhone: p.user?.phone || p.billingAddress?.phone
        })));
        
        // Try to match by phone number if available
        const sourcePhone = payload?.obj?.source_data?.phone_number || 
                           payload?.obj?.source_data?.sub_type;
        if (sourcePhone) {
          console.log('🔍 [Webhook] Source phone from payment:', sourcePhone);
          for (const pp of pendingPurchases) {
            const userPhone = pp.user?.phone || pp.billingAddress?.phone;
            // Normalize phone numbers for comparison
            const normalizedSourcePhone = sourcePhone.replace(/\D/g, '').slice(-10);
            const normalizedUserPhone = userPhone?.replace(/\D/g, '').slice(-10);
            
            if (normalizedUserPhone && normalizedSourcePhone && 
                normalizedUserPhone === normalizedSourcePhone) {
              purchase = pp;
              console.log('✅ [Webhook] Found purchase by phone match:', purchase.orderNumber);
              break;
            }
          }
        }
        
        // SAFETY: Do NOT use most recent blindly - this caused wrong enrollments!
        // Log error and let manual verification handle it
        if (!purchase) {
          console.error('❌ [Webhook] CRITICAL: Multiple pending purchases with same amount - cannot determine correct one!');
          console.error('This payment requires manual verification.');
          console.error('Transaction ID:', transactionId);
          console.error('Amount:', amountInEGP, 'EGP');
          console.error('Pending order numbers:', pendingPurchases.map(p => p.orderNumber));
        }
      }
    }

    if (!purchase) {
      console.error('❌ [Webhook] Purchase not found!');
      console.error('Lookup attempted with:');
      console.error('  - Merchant Order ID:', webhookData.merchantOrderId);
      console.error('  - Transaction ID:', transactionId);
      console.error('  - Paymob Order ID:', paymobOrderId);
      console.error('Payload keys:', Object.keys(payload || {}));
      console.error('Obj keys:', Object.keys(payload?.obj || {}));
      console.error('Order data:', JSON.stringify(payload?.obj?.order || {}));
      return; // Already sent 200 OK
    }

    // Save Paymob transaction details
    const txnId = payload?.obj?.id || payload?.id || webhookData.transactionId;
    const pOrderId = payload?.obj?.order?.id || payload?.obj?.order || payload?.order;

    // Always update transaction IDs if not set
    let needsSave = false;
    if (txnId && !purchase.paymobTransactionId) {
      purchase.paymobTransactionId = String(txnId);
      needsSave = true;
    }
    if (pOrderId && !purchase.paymobOrderId) {
      purchase.paymobOrderId = String(pOrderId);
      needsSave = true;
    }

    // CRITICAL: Handle payment that's already completed - verify enrollments
    if (purchase.status === 'completed') {
      console.log(`ℹ️ [Webhook] Purchase ${purchase.orderNumber} already completed - verifying enrollments...`);
      
      // Verify user is actually enrolled (safety net)
      try {
        const user = await User.findById(purchase.user._id);
        let allEnrolled = true;
        
        for (const item of purchase.items) {
          if (item.itemType === 'bundle') {
            const bundle = await BundleCourse.findById(item.item).populate('courses');
            if (bundle) {
              for (const course of bundle.courses) {
                if (!user.isEnrolled(course._id)) {
                  allEnrolled = false;
                  console.log(`⚠️ [Webhook] Missing enrollment for course ${course._id}, re-enrolling...`);
                  user.enrolledCourses.push({
                    course: course._id,
                    enrolledAt: new Date(),
                    progress: 0,
                    lastAccessed: new Date(),
                    completedTopics: [],
                    status: 'active',
                  });
                }
              }
            }
          } else {
            if (!user.isEnrolled(item.item)) {
              allEnrolled = false;
              console.log(`⚠️ [Webhook] Missing enrollment for course ${item.item}, re-enrolling...`);
              user.enrolledCourses.push({
                course: item.item,
                enrolledAt: new Date(),
                progress: 0,
                lastAccessed: new Date(),
                completedTopics: [],
                status: 'active',
              });
            }
          }
        }
        
        if (!allEnrolled) {
          await user.save();
          console.log('✅ [Webhook] Fixed missing enrollments for completed purchase');
        }
      } catch (enrollError) {
        console.error('❌ [Webhook] Error verifying enrollments:', enrollError);
      }
      
      return; // Already sent 200 OK
    }

    // CRITICAL FIX: If webhook says SUCCESS but purchase was marked FAILED, correct it
    if (webhookData.isSuccess && purchase.status === 'failed') {
      console.log('🔧 [Webhook] CORRECTING: Payment was incorrectly marked as failed!');
      console.log('Order:', purchase.orderNumber);
      console.log('Previous failure reason:', purchase.failureReason);
      
      // Reset to pending so processSuccessfulPayment can handle it
      purchase.status = 'pending';
      purchase.paymentStatus = 'pending';
      purchase.failureReason = null;
      needsSave = true;
    }

    if (needsSave) {
      await purchase.save();
    }

    // Skip if already in final state (after correction check)
    if (purchase.status !== 'pending') {
      console.log(`ℹ️ [Webhook] Purchase ${purchase.orderNumber} status: ${purchase.status}`);
      return; // Already sent 200 OK
    }

    // ====================================
    // HANDLE SUCCESS - SINGLE SOURCE OF TRUTH
    // ====================================
    if (webhookData.isSuccess) {
      console.log('✅ [Webhook] Payment SUCCESS for:', purchase.orderNumber);
      console.log('Transaction ID:', transactionId);
      console.log('Amount:', payload?.obj?.amount_cents / 100, 'EGP');

      // Save payment gateway response
      purchase.paymentGatewayResponse = {
        webhookPayload: payload,
        webhookProcessedAt: new Date(),
        webhookSource: 'paymob_webhook_v2',
        transactionId: transactionId,
        paymobOrderId: paymobOrderId,
        success: true,
        amountCents: payload?.obj?.amount_cents,
      };
      await purchase.save();

      // Process successful payment - THIS IS WHERE ENROLLMENT HAPPENS
      // Multiple retry attempts to ensure enrollment completes
      let processSuccess = false;
      let lastError = null;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`🔄 [Webhook] Processing payment (attempt ${attempt}/3)...`);
          await processSuccessfulPayment(purchase, null);
          processSuccess = true;
          console.log(`✅ [Webhook] Successfully processed and enrolled! Order: ${purchase.orderNumber}`);
          break;
        } catch (processError) {
          lastError = processError;
          console.error(`❌ [Webhook] Attempt ${attempt} failed:`, processError.message);
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      if (!processSuccess) {
        console.error('❌❌❌ [Webhook] CRITICAL: All processing attempts failed!');
        console.error('Order:', purchase.orderNumber);
        console.error('Last error:', lastError);
        console.error('MANUAL INTERVENTION REQUIRED');
        
        // Mark the purchase as needing manual review
        purchase.notes = (purchase.notes || '') + 
          `\n[${new Date().toISOString()}] CRITICAL: Webhook received SUCCESS but enrollment failed after 3 attempts. Error: ${lastError?.message}`;
        await purchase.save();
      }

      console.log(`⏱️ [Webhook] Processing time: ${Date.now() - startTime}ms`);
      return; // Already sent 200 OK
    }

    // ====================================
    // HANDLE FAILURE
    // ====================================
    if (webhookData.isFailed) {
      console.log('❌ [Webhook] Payment FAILED for:', purchase.orderNumber);

      const failureReason =
        payload?.obj?.data?.message ||
        payload?.data?.message ||
        payload?.obj?.message ||
        payload?.obj?.data?.acq_response_code ||
        'Payment declined or failed';

      console.log('Failure reason:', failureReason);

      await processFailedPayment(
        purchase,
        failureReason,
        {
          webhookPayload: payload,
          webhookProcessedAt: new Date(),
          webhookSource: 'paymob_webhook_v2',
        }
      );

      console.log(`⏱️ [Webhook] Processing time: ${Date.now() - startTime}ms`);
      return; // Already sent 200 OK
    }

    // ====================================
    // HANDLE PENDING/UNKNOWN
    // ====================================
    console.log('⏳ [Webhook] Payment status unclear for:', purchase.orderNumber);
    console.log('isSuccess:', webhookData.isSuccess);
    console.log('isFailed:', webhookData.isFailed);
    
    // Save webhook data but don't change status
    purchase.paymentGatewayResponse = {
      webhookPayload: payload,
      webhookProcessedAt: new Date(),
      webhookSource: 'paymob_webhook_v2',
      status: 'pending_review',
    };
    await purchase.save();
    
    console.log(`⏱️ [Webhook] Processing time: ${Date.now() - startTime}ms`);
    // Already sent 200 OK
    
  } catch (error) {
    console.error('❌ [Webhook] CRITICAL ERROR:', error);
    console.error('Stack:', error.stack);
    console.error('Purchase:', purchase?.orderNumber);
    // Already sent 200 OK at the beginning
  }
};

// Handle Paymob webhook GET redirects (browser callbacks)
// NOW SIMPLIFIED - Just redirects to success/fail pages based on DB status
// Webhook (POST) is the single source of truth for payment processing
const handlePaymobWebhookRedirect = async (req, res) => {
  try {
    console.log('🔀 [Redirect] Paymob redirect callback received:', req.query);

    let merchantOrderId =
      req.query.merchant_order_id ||
      req.query.merchantOrder ||
      req.query.merchantOrderId;

    let purchase = null;

    // For unified checkout, merchant_order_id might not be in query params
    // Try to find purchase by transaction ID or session user
    if (!merchantOrderId && req.query.id) {
      console.log(
        '🔀 [Redirect] Unified checkout callback - looking up purchase...'
      );

      // Try to find the most recent pending purchase for the session user
      if (req.session && req.session.user) {
        const userId = req.session.user.id;
        purchase = await Purchase.findOne({
          user: userId,
          status: 'pending',
          paymentStatus: 'pending',
        })
          .sort({ createdAt: -1 })
          .limit(1);

        if (purchase) {
          merchantOrderId = purchase.paymentIntentId;
          console.log('🔀 [Redirect] Found pending purchase:', merchantOrderId);
        }
      }
    }

    // If still no merchant order ID, try to find by transaction ID
    if (!merchantOrderId && req.query.id) {
      purchase = await Purchase.findOne({
        paymobTransactionId: req.query.id,
      });
      if (purchase) {
        merchantOrderId = purchase.paymentIntentId;
      }
    }

    // If still no merchant order ID or purchase, redirect to failure
    if (!merchantOrderId && !purchase) {
      console.warn('🔀 [Redirect] No merchant order ID found');
      return res.redirect('/purchase/payment/fail?reason=missing_order_id');
    }

    // Find purchase by merchant order ID if not already found
    if (!purchase && merchantOrderId) {
      purchase = await Purchase.findOne({
        paymentIntentId: merchantOrderId,
      });
    }

    if (!purchase) {
      console.warn('🔀 [Redirect] Purchase not found');
      return res.redirect('/purchase/payment/fail?reason=order_not_found');
    }

    // Save Paymob transaction details if available (for reference)
    let updated = false;
    if (req.query.id && !purchase.paymobTransactionId) {
      purchase.paymobTransactionId = req.query.id;
      updated = true;
    }
    if (req.query.order && !purchase.paymobOrderId) {
      purchase.paymobOrderId = req.query.order;
      updated = true;
    }
    if (updated) {
      await purchase.save();
    }

    // Check DB status - webhook should have already processed the payment
    console.log('🔀 [Redirect] Purchase status:', purchase.status);

    if (purchase.status === 'completed') {
      // Payment already processed by webhook, redirect to success
      return res.redirect(
        `/purchase/payment/success?merchantOrderId=${merchantOrderId}`
      );
    } else if (purchase.status === 'failed') {
      // Payment already processed by webhook, redirect to failure
      const reason = purchase.failureReason
        ? encodeURIComponent(purchase.failureReason)
        : 'payment_failed';
      return res.redirect(`/purchase/payment/fail?reason=${reason}`);
    } else if (purchase.status === 'pending') {
      // Payment still pending - webhook should process it
      // IMPROVED: Wait briefly for webhook, then use Transaction Inquiry API as fallback
      console.log('🔀 [Redirect] Payment pending, waiting for webhook...');
      
      // Wait 3 seconds to give webhook time to arrive (webhooks are usually faster)
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Re-fetch purchase status after waiting
      const updatedPurchase = await Purchase.findById(purchase._id);
      
      if (updatedPurchase.status === 'completed') {
        console.log('✅ [Redirect] Webhook processed payment successfully during wait');
        return res.redirect(`/purchase/payment/success?merchantOrderId=${merchantOrderId}`);
      } else if (updatedPurchase.status === 'failed') {
        console.log('❌ [Redirect] Webhook marked payment as failed during wait');
        const reason = updatedPurchase.failureReason ? encodeURIComponent(updatedPurchase.failureReason) : 'payment_failed';
        return res.redirect(`/purchase/payment/fail?reason=${reason}`);
      }
      
      // Still pending - use Transaction Inquiry API as definitive source
      // This is a fallback ONLY if webhook hasn't arrived yet
      console.log('⏳ [Redirect] Still pending, querying Paymob Transaction Inquiry API as fallback...');
      
      try {
        // Use all available IDs for better lookup
        const transactionStatus = await paymobService.queryTransactionStatus(
          merchantOrderId,
          updatedPurchase.paymobOrderId,
          updatedPurchase.paymobTransactionId || req.query.id
        );
        
        if (transactionStatus) {
          const apiWebhookData = paymobService.processWebhookPayload(transactionStatus);
          
          if (apiWebhookData.isSuccess) {
            console.log('✅ [Redirect] Transaction Inquiry confirms SUCCESS, processing payment...');
            
            // Save Paymob transaction details
            const purchaseToUpdate = await Purchase.findById(purchase._id);
            if (apiWebhookData.transactionId && !purchaseToUpdate.paymobTransactionId) {
              purchaseToUpdate.paymobTransactionId = String(apiWebhookData.transactionId);
            }
            purchaseToUpdate.paymentGatewayResponse = {
              apiResponse: transactionStatus,
              processedAt: new Date(),
              status: 'completed',
              source: 'transaction_inquiry_api_fallback',
            };
            await purchaseToUpdate.save();
            
            // Process successful payment - this will enroll the student
            await processSuccessfulPayment(purchaseToUpdate, req);
            return res.redirect(`/purchase/payment/success?merchantOrderId=${merchantOrderId}`);
          } else if (apiWebhookData.isFailed) {
            console.log('❌ [Redirect] Transaction Inquiry confirms FAILED');
            
            const failureReason = transactionStatus?.obj?.data?.message || 
                                  transactionStatus?.data?.message || 
                                  'Payment declined or failed';
            
            await processFailedPayment(purchase, failureReason, {
              apiResponse: transactionStatus,
              processedAt: new Date(),
              status: 'failed',
              source: 'transaction_inquiry_api_fallback',
            });
            
            return res.redirect(`/purchase/payment/fail?reason=${encodeURIComponent(failureReason)}`);
          } else {
            // Transaction Inquiry returned pending status
            console.log('⏳ [Redirect] Transaction Inquiry also shows pending - showing processing page');
            return res.render('payment-processing', {
              title: 'Payment Processing | ELKABLY',
              theme: req.cookies.theme || 'light',
              merchantOrderId: merchantOrderId,
              orderNumber: purchase.orderNumber,
            });
          }
        }
      } catch (inquiryError) {
        console.warn('⚠️ [Redirect] Transaction Inquiry failed:', inquiryError.message);
        // Show processing page - webhook will process when it arrives
        return res.render('payment-processing', {
          title: 'Payment Processing | ELKABLY',
          theme: req.cookies.theme || 'light',
          merchantOrderId: merchantOrderId,
          orderNumber: purchase.orderNumber,
        });
      }
      
      // Final fallback: Show processing page
      // Webhook will process the payment when it arrives
      console.log('⏳ [Redirect] Payment still pending - showing processing page');
      return res.render('payment-processing', {
        title: 'Payment Processing | ELKABLY',
        theme: req.cookies.theme || 'light',
        merchantOrderId: merchantOrderId,
        orderNumber: purchase.orderNumber,
      });
    } else {
      // Unknown status
      return res.redirect('/purchase/payment/fail?reason=unknown_status');
    }
  } catch (error) {
    console.error('❌ [Redirect] Error processing Paymob redirect:', error);
    return res.redirect('/purchase/payment/fail?reason=processing_error');
  }
};

module.exports = {
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
  recalculateCartFromDB,
  // Promo Code Management
  validatePromoCode,
  removePromoCode,
  clearInvalidPromoCode,
  // Payment Processing Functions (for admin use)
  processSuccessfulPayment,
  processFailedPayment,
};

