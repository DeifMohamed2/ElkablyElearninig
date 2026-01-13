/**
 * Pending Payment Verification Job
 * 
 * This job runs periodically to check for pending payments that might have
 * been missed due to webhook failures, network issues, or user closing the browser.
 * 
 * It uses Paymob's Transaction Inquiry API to verify the actual payment status
 * and completes any payments that were successful but not processed.
 * 
 * This is a SAFETY NET - the webhook is still the primary processing mechanism.
 */

const Purchase = require('../models/Purchase');
const User = require('../models/User');
const BundleCourse = require('../models/BundleCourse');
const Course = require('../models/Course');
const PromoCode = require('../models/PromoCode');
const BookOrder = require('../models/BookOrder');
const paymobService = require('../utils/paymobService');

// How long to wait before checking pending payments (in milliseconds)
const MIN_PENDING_AGE_MS = 2 * 60 * 1000; // 2 minutes - give webhook time to arrive
const MAX_PENDING_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours - don't check very old ones

// How often to run the job (in milliseconds)
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Every 5 minutes

let isRunning = false;
let jobInterval = null;

/**
 * Process a successful payment (duplicated from purchaseController for isolation)
 * This is a simplified version focused on just the critical enrollment
 */
async function processSuccessfulPaymentJob(purchase) {
  try {
    console.log(`[PaymentJob] Processing successful payment for order: ${purchase.orderNumber}`);

    // Atomic update to completed status
    const updatedPurchase = await Purchase.findOneAndUpdate(
      { 
        _id: purchase._id,
        status: 'pending'
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

    if (!updatedPurchase) {
      console.log(`[PaymentJob] Purchase ${purchase.orderNumber} was already processed`);
      return { success: true, alreadyProcessed: true };
    }

    // Get user
    const user = await User.findById(updatedPurchase.user._id);
    if (!user) {
      throw new Error('User not found');
    }

    // Process enrollments
    for (const item of updatedPurchase.items) {
      if (item.itemType === 'bundle') {
        await user.addPurchasedBundle(item.item, item.price, updatedPurchase.orderNumber);
        
        const bundle = await BundleCourse.findById(item.item).populate('courses');
        if (bundle) {
          await user.enrollInBundleCourses(bundle);
          console.log(`[PaymentJob] ✅ Enrolled user in bundle: ${bundle.title}`);
        }
      } else {
        await user.addPurchasedCourse(item.item, item.price, updatedPurchase.orderNumber);
        
        if (!user.isEnrolled(item.item)) {
          user.enrolledCourses.push({
            course: item.item,
            enrolledAt: new Date(),
            progress: 0,
            lastAccessed: new Date(),
            completedTopics: [],
            status: 'active',
          });
          await user.save();
          console.log(`[PaymentJob] ✅ Enrolled user in course: ${item.title}`);
        }
      }
    }

    // Handle promo code
    if (updatedPurchase.appliedPromoCode && updatedPurchase.discountAmount > 0) {
      try {
        await user.addPromoCodeUsage(
          updatedPurchase.appliedPromoCode,
          updatedPurchase._id,
          updatedPurchase.discountAmount,
          updatedPurchase.originalAmount,
          updatedPurchase.total
        );

        const promoCode = await PromoCode.findById(updatedPurchase.appliedPromoCode);
        if (promoCode) {
          promoCode.usageHistory.push({
            user: updatedPurchase.user._id,
            purchase: updatedPurchase._id,
            discountAmount: updatedPurchase.discountAmount,
            originalAmount: updatedPurchase.originalAmount,
            finalAmount: updatedPurchase.total,
            usedAt: new Date(),
          });
          promoCode.currentUses += 1;
          await promoCode.save();
        }
      } catch (promoError) {
        console.error('[PaymentJob] Error tracking promo code:', promoError);
      }
    }

    // Update book orders
    if (updatedPurchase.bookOrders && updatedPurchase.bookOrders.length > 0) {
      await BookOrder.updateMany(
        { _id: { $in: updatedPurchase.bookOrders } },
        { status: 'processing' }
      );
    }

    console.log(`[PaymentJob] ✅ Successfully completed order: ${updatedPurchase.orderNumber}`);
    return { success: true, purchase: updatedPurchase };

  } catch (error) {
    console.error('[PaymentJob] Error processing payment:', error);
    throw error;
  }
}

/**
 * Main job function - checks pending payments and verifies with Paymob
 */
async function checkPendingPayments() {
  if (isRunning) {
    console.log('[PaymentJob] Already running, skipping...');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    const now = new Date();
    const minDate = new Date(now.getTime() - MAX_PENDING_AGE_MS);
    const maxDate = new Date(now.getTime() - MIN_PENDING_AGE_MS);

    // Find pending payments in the valid time window
    const pendingPurchases = await Purchase.find({
      status: 'pending',
      paymentStatus: 'pending',
      paymentIntentId: { $exists: true, $ne: null, $ne: '' },
      createdAt: { 
        $gte: minDate,
        $lte: maxDate
      }
    })
    .populate('user')
    .sort({ createdAt: 1 })
    .limit(20); // Process in batches to avoid overloading

    if (pendingPurchases.length === 0) {
      console.log('[PaymentJob] No pending payments to verify');
      isRunning = false;
      return;
    }

    console.log(`\n[PaymentJob] ==========================================`);
    console.log(`[PaymentJob] Checking ${pendingPurchases.length} pending payments`);
    console.log(`[PaymentJob] Time window: ${maxDate.toISOString()} to ${minDate.toISOString()}`);
    console.log(`[PaymentJob] ==========================================\n`);

    let processed = 0;
    let completed = 0;
    let failed = 0;
    let stillPending = 0;
    let errors = 0;

    for (const purchase of pendingPurchases) {
      processed++;
      
      try {
        console.log(`[PaymentJob] Checking order: ${purchase.orderNumber}`);
        console.log(`[PaymentJob]   - paymentIntentId: ${purchase.paymentIntentId}`);
        console.log(`[PaymentJob]   - paymobOrderId: ${purchase.paymobOrderId || 'N/A'}`);
        console.log(`[PaymentJob]   - paymobTransactionId: ${purchase.paymobTransactionId || 'N/A'}`);

        // Query Paymob Transaction Inquiry API with all available IDs
        const transactionStatus = await paymobService.queryTransactionStatus(
          purchase.paymentIntentId,
          purchase.paymobOrderId,
          purchase.paymobTransactionId
        );

        if (!transactionStatus) {
          console.log(`[PaymentJob] No transaction data for: ${purchase.orderNumber}`);
          stillPending++;
          continue;
        }

        // Process the transaction status
        const webhookData = paymobService.processWebhookPayload(transactionStatus);

        if (webhookData.isSuccess) {
          console.log(`[PaymentJob] ✅ Payment CONFIRMED SUCCESS for: ${purchase.orderNumber}`);
          
          // Save transaction details
          if (webhookData.transactionId) {
            purchase.paymobTransactionId = String(webhookData.transactionId);
          }
          if (webhookData.paymobOrderId) {
            purchase.paymobOrderId = String(webhookData.paymobOrderId);
          }
          purchase.paymentGatewayResponse = {
            ...transactionStatus,
            verifiedAt: new Date(),
            verifiedBy: 'pending_payment_job',
          };
          await purchase.save();

          // Process the payment
          await processSuccessfulPaymentJob(purchase);
          completed++;
          
        } else if (webhookData.isFailed) {
          console.log(`[PaymentJob] ❌ Payment CONFIRMED FAILED for: ${purchase.orderNumber}`);
          
          const failureReason = transactionStatus?.obj?.data?.message || 
                                transactionStatus?.data?.message || 
                                'Payment declined';
          
          purchase.status = 'failed';
          purchase.paymentStatus = 'failed';
          purchase.failureReason = failureReason;
          purchase.paymentGatewayResponse = {
            ...transactionStatus,
            verifiedAt: new Date(),
            verifiedBy: 'pending_payment_job',
          };
          await purchase.save();

          // Cancel book orders
          if (purchase.bookOrders && purchase.bookOrders.length > 0) {
            await BookOrder.updateMany(
              { _id: { $in: purchase.bookOrders } },
              { status: 'cancelled' }
            );
          }
          
          failed++;
          
        } else {
          console.log(`[PaymentJob] ⏳ Payment still pending for: ${purchase.orderNumber}`);
          stillPending++;
        }

        // Small delay between API calls to be nice to Paymob
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`[PaymentJob] Error checking ${purchase.orderNumber}:`, error.message);
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`\n[PaymentJob] ==========================================`);
    console.log(`[PaymentJob] Job completed in ${duration}ms`);
    console.log(`[PaymentJob] Processed: ${processed}, Completed: ${completed}, Failed: ${failed}, Still Pending: ${stillPending}, Errors: ${errors}`);
    console.log(`[PaymentJob] ==========================================\n`);

  } catch (error) {
    console.error('[PaymentJob] Critical error:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the background job
 */
function startPendingPaymentJob() {
  if (jobInterval) {
    console.log('[PaymentJob] Job already running');
    return;
  }

  console.log('[PaymentJob] Starting pending payment verification job');
  console.log(`[PaymentJob] Check interval: ${CHECK_INTERVAL_MS / 1000} seconds`);
  console.log(`[PaymentJob] Min pending age: ${MIN_PENDING_AGE_MS / 1000} seconds`);
  console.log(`[PaymentJob] Max pending age: ${MAX_PENDING_AGE_MS / 1000 / 60} minutes`);

  // Run immediately on start
  setTimeout(checkPendingPayments, 10000); // Wait 10 seconds for app to initialize

  // Then run on interval
  jobInterval = setInterval(checkPendingPayments, CHECK_INTERVAL_MS);

  console.log('[PaymentJob] Job started successfully');
}

/**
 * Stop the background job
 */
function stopPendingPaymentJob() {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
    console.log('[PaymentJob] Job stopped');
  }
}

/**
 * Manually trigger a check (for testing or admin use)
 */
async function triggerManualCheck() {
  console.log('[PaymentJob] Manual check triggered');
  await checkPendingPayments();
}

module.exports = {
  startPendingPaymentJob,
  stopPendingPaymentJob,
  checkPendingPayments,
  triggerManualCheck,
};
