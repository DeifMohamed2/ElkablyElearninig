const Purchase = require('../models/Purchase');
const User = require('../models/User');
const BundleCourse = require('../models/BundleCourse');
const Course = require('../models/Course');

// Get cart data (for API calls)
const getCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Please login to view your cart' 
      });
    }

    // Get cart from session or create empty cart
    const cart = req.session.cart || [];
    
    // Calculate totals
    const subtotal = cart.reduce((sum, item) => sum + item.price, 0);
    const tax = subtotal * 0.1; // 10% tax
    const total = subtotal + tax;

    res.json({
      success: true,
      cart,
      subtotal,
      tax,
      total,
      cartCount: cart.length
    });
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading cart' 
    });
  }
};

// Add item to cart
const addToCart = async (req, res) => {
  try {
    const { itemId, itemType, title, price, image } = req.body;
    
    console.log('Add to cart request:', { itemId, itemType, title, price, image });
    console.log('Session user:', req.session.user);

    if (!req.session.user) {
      console.log('No user in session, returning 401');
      return res.status(401).json({ 
        success: false, 
        message: 'Please login to add items to cart' 
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
        message: 'Item not found' 
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
        message: 'User not found' 
      });
    }

    if (itemType === 'bundle' && user.hasPurchasedBundle(itemId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'You have already purchased this bundle' 
      });
    }

    if (itemType === 'course' && user.hasAccessToCourse(itemId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'You already have access to this course through a previous purchase or bundle' 
      });
    }

    // Initialize cart if not exists
    if (!req.session.cart) {
      req.session.cart = [];
    }

    // Check if item already in cart
    const existingItem = req.session.cart.find(cartItem => 
      cartItem.id === itemId && cartItem.type === itemType
    );

    if (existingItem) {
      return res.status(400).json({ 
        success: false, 
        message: 'Item already in cart' 
      });
    }

    // Check for bundle/course conflicts
    if (itemType === 'course') {
      // Check if this course is already in a bundle that's in the cart
      for (const cartItem of req.session.cart) {
        if (cartItem.type === 'bundle') {
          const bundle = await BundleCourse.findById(cartItem.id).populate('courses');
          if (bundle && bundle.courses.some(course => course._id.toString() === itemId)) {
            return res.status(400).json({ 
              success: false, 
              message: `This course is already included in the "${bundle.title}" bundle in your cart. Please remove the bundle first if you want to purchase this course individually.` 
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
          const existingCourse = req.session.cart.find(cartItem => 
            cartItem.type === 'course' && cartItem.id === course._id.toString()
          );
          if (existingCourse) {
            conflictingCourses.push(course.title);
          }
        }
        
        if (conflictingCourses.length > 0) {
          return res.status(400).json({ 
            success: false, 
            message: `This bundle contains courses that are already in your cart: ${conflictingCourses.join(', ')}. Please remove those individual courses first if you want to purchase the bundle.` 
          });
        }
      }
    }

    // Add item to cart
    const cartItem = {
      id: itemId,
      type: itemType,
      title: title || item.title,
      price: price || item.price,
      image: image || item.thumbnail || '/images/adad.png',
      addedAt: new Date()
    };

    req.session.cart.push(cartItem);

    res.json({ 
      success: true, 
      message: 'Item added to cart successfully',
      cartCount: req.session.cart.length
    });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error adding item to cart' 
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
        message: 'Cart is empty' 
      });
    }

    req.session.cart = req.session.cart.filter(item => 
      !(item.id === itemId && item.type === itemType)
    );

    res.json({ 
      success: true, 
      message: 'Item removed from cart',
      cartCount: req.session.cart.length
    });
  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error removing item from cart' 
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
        message: 'Cart is empty' 
      });
    }

    const item = req.session.cart.find(cartItem => 
      cartItem.id === itemId && cartItem.type === itemType
    );

    if (!item) {
      return res.status(404).json({ 
        success: false, 
        message: 'Item not found in cart' 
      });
    }

    if (quantity <= 0) {
      req.session.cart = req.session.cart.filter(cartItem => 
        !(cartItem.id === itemId && cartItem.type === itemType)
      );
    } else {
      item.quantity = Math.min(quantity, 1); // Max quantity is 1
    }

    // Calculate totals
    const subtotal = req.session.cart.reduce((sum, item) => sum + item.price, 0);
    const tax = subtotal * 0.1;
    const total = subtotal + tax;

    res.json({ 
      success: true, 
      message: 'Cart updated successfully',
      cartCount: req.session.cart.length,
      subtotal,
      tax,
      total
    });
  } catch (error) {
    console.error('Error updating cart:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating cart' 
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

    const cart = req.session.cart || [];
    
    if (cart.length === 0) {
      req.flash('error_msg', 'Your cart is empty');
      return res.redirect('/');
    }

    // Calculate totals
    const subtotal = cart.reduce((sum, item) => sum + item.price, 0);
    const tax = subtotal * 0.1;
    const total = subtotal + tax;

    res.render('checkout', {
      title: 'Checkout - Mr Kably',
      theme: req.cookies.theme || 'light',
      cart,
      subtotal,
      tax,
      total,
      user: req.session.user
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
        message: 'Please login to complete purchase' 
      });
    }

    const cart = req.session.cart || [];
    
    if (cart.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cart is empty' 
      });
    }

    const { 
      paymentMethod = 'credit_card',
      billingAddress 
    } = req.body;

    // Use default billing address if not provided
    const defaultBillingAddress = {
      firstName: req.session.user.firstName || 'Default',
      lastName: req.session.user.lastName || 'User',
      email: req.session.user.studentEmail || req.session.user.email,
      phone: `${req.session.user.parentCountryCode || '+966'}${req.session.user.parentNumber || '123456789'}`,
      address: 'Default Address',
      city: 'Riyadh',
      state: 'Riyadh',
      zipCode: '12345',
      country: 'Saudi Arabia'
    };

    const finalBillingAddress = billingAddress || defaultBillingAddress;

    // Calculate totals
    const subtotal = cart.reduce((sum, item) => sum + item.price, 0);
    const tax = subtotal * 0.1;
    const total = subtotal + tax;

    // Get user from database
    const user = await User.findById(req.session.user.id)
      .populate('purchasedBundles.bundle')
      .populate('purchasedCourses.course')
      .populate('enrolledCourses.course');
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Create purchase record
    const purchase = new Purchase({
      user: user._id,
      items: cart.map(item => ({
        itemType: item.type,
        itemTypeModel: item.type === 'bundle' ? 'BundleCourse' : 'Course',
        item: item.id,
        title: item.title,
        price: item.price,
        quantity: 1
      })),
      subtotal,
      tax,
      total,
      paymentMethod,
      billingAddress: finalBillingAddress,
      status: 'completed',
      paymentStatus: 'completed',
      paymentIntentId: `pi_${Date.now()}`
    });

    console.log('Creating purchase record:', purchase);
    
    try {
      await purchase.save();
      console.log('Purchase saved successfully with order number:', purchase.orderNumber);
    } catch (saveError) {
      console.error('Error saving purchase:', saveError);
      throw saveError;
    }
    
    // Refresh the purchase to get the generated orderNumber
    await purchase.populate('items.item');

    // Update user's purchased items and enrollments
    for (const item of cart) {
      if (item.type === 'bundle') {
        await user.addPurchasedBundle(item.id, item.price, purchase.orderNumber);
        
        // Enroll user in all courses in the bundle
        const bundle = await BundleCourse.findById(item.id).populate('courses');
        await user.enrollInBundleCourses(bundle);
      } else {
        await user.addPurchasedCourse(item.id, item.price, purchase.orderNumber);
        
        // Enroll user in the course
        if (!user.isEnrolled(item.id)) {
          user.enrolledCourses.push({
            course: item.id,
            enrolledAt: new Date(),
            progress: 0,
            lastAccessed: new Date(),
            completedTopics: [],
            status: 'active'
          });
          await user.save();
        }
      }
    }

    // Clear cart
    req.session.cart = [];

    res.json({ 
      success: true, 
      message: 'Payment processed successfully',
      purchase: {
        orderNumber: purchase.orderNumber,
        items: cart.map(item => ({
          ...item,
          type: item.type
        })),
        subtotal,
        tax,
        total
      }
    });
  } catch (error) {
    console.error('Error processing direct checkout:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error processing payment' 
    });
  }
};

// Process payment and create order
const processPayment = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Please login to complete purchase' 
      });
    }

    const cart = req.session.cart || [];
    
    if (cart.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cart is empty' 
      });
    }

    const { 
      paymentMethod,
      billingAddress 
    } = req.body;

    // Validate billing address
    const requiredFields = ['firstName', 'lastName', 'email', 'phone', 'address', 'city', 'state', 'zipCode', 'country'];
    for (const field of requiredFields) {
      if (!billingAddress[field]) {
        return res.status(400).json({ 
          success: false, 
          message: `${field} is required` 
        });
      }
    }

    // Calculate totals
    const subtotal = cart.reduce((sum, item) => sum + item.price, 0);
    const tax = subtotal * 0.1;
    const total = subtotal + tax;

    // Create purchase record
    const purchase = new Purchase({
      user: req.session.user.id,
      items: cart.map(item => ({
        itemType: item.type,
        itemTypeModel: item.type === 'bundle' ? 'BundleCourse' : 'Course',
        item: item.id,
        title: item.title,
        price: item.price,
        quantity: 1
      })),
      subtotal,
      tax,
      total,
      paymentMethod,
      billingAddress,
      status: 'pending',
      paymentStatus: 'pending'
    });

    console.log('Creating purchase record:', purchase);
    
    try {
      await purchase.save();
      console.log('Purchase saved successfully with order number:', purchase.orderNumber);
    } catch (saveError) {
      console.error('Error saving purchase:', saveError);
      throw saveError;
    }

    // For now, simulate successful payment
    // In real implementation, integrate with payment gateway here
    // For Egypt: Credit Cards (Visa, Mastercard, Amex) or Mobile Wallets (Vodafone Cash, Orange Money, Etisalat Cash)
    if (paymentMethod === 'mobile_wallet') {
      console.log('Processing mobile wallet payment (Vodafone Cash, Orange Money, Etisalat Cash)');
    } else {
      console.log('Processing credit card payment (Visa, Mastercard, American Express)');
    }
    
    purchase.status = 'completed';
    purchase.paymentStatus = 'completed';
    purchase.paymentIntentId = `pi_${Date.now()}`;
    await purchase.save();

    // Get user from database
    const user = await User.findById(req.session.user.id)
      .populate('purchasedBundles.bundle')
      .populate('purchasedCourses.course')
      .populate('enrolledCourses.course');
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Update user's purchased items and enrollments
    for (const item of cart) {
      if (item.type === 'bundle') {
        await user.addPurchasedBundle(item.id, item.price, purchase.orderNumber);
        
        // Enroll user in all courses in the bundle
        const bundle = await BundleCourse.findById(item.id).populate('courses');
        await user.enrollInBundleCourses(bundle);
      } else {
        await user.addPurchasedCourse(item.id, item.price, purchase.orderNumber);
        
        // Enroll user in the course
        if (!user.isEnrolled(item.id)) {
          user.enrolledCourses.push({
            course: item.id,
            enrolledAt: new Date(),
            progress: 0,
            lastAccessed: new Date(),
            completedTopics: [],
            status: 'active'
          });
          await user.save();
        }
      }
    }

    // Clear cart
    req.session.cart = [];

    res.json({ 
      success: true, 
      message: 'Payment processed successfully',
      purchase: {
        orderNumber: purchase.orderNumber,
        items: cart.map(item => ({
          ...item,
          type: item.type
        })),
        subtotal,
        tax,
        total
      }
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error processing payment' 
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

    const totalPurchases = await Purchase.countDocuments({ user: req.session.user.id });
    const totalPages = Math.ceil(totalPurchases / parseInt(limit));

    res.render('purchase-history', {
      title: 'Purchase History - Mr Kably',
      theme: req.cookies.theme || 'light',
      purchases,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalPurchases,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      },
      user: req.session.user
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
        message: 'Please login to add items to wishlist' 
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
        message: 'Item not found' 
      });
    }

    // Get user from database
    const user = await User.findById(req.session.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Add to wishlist
    if (itemType === 'bundle') {
      if (user.isBundleInWishlist(itemId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Bundle already in wishlist' 
        });
      }
      await user.addBundleToWishlist(itemId);
    } else {
      if (user.isCourseInWishlist(itemId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Course already in wishlist' 
        });
      }
      await user.addCourseToWishlist(itemId);
    }

    res.json({ 
      success: true, 
      message: `${itemType === 'bundle' ? 'Bundle' : 'Course'} added to wishlist successfully`
    });
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error adding item to wishlist' 
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
        message: 'Please login to remove items from wishlist' 
      });
    }

    // Get user from database
    const user = await User.findById(req.session.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Remove from wishlist
    if (itemType === 'bundle') {
      if (!user.isBundleInWishlist(itemId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Bundle not in wishlist' 
        });
      }
      await user.removeBundleFromWishlist(itemId);
    } else {
      if (!user.isCourseInWishlist(itemId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Course not in wishlist' 
        });
      }
      await user.removeCourseFromWishlist(itemId);
    }

    res.json({ 
      success: true, 
      message: `${itemType === 'bundle' ? 'Bundle' : 'Course'} removed from wishlist successfully`
    });
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error removing item from wishlist' 
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
        message: 'Please login to manage wishlist' 
      });
    }

    // Get user from database
    const user = await User.findById(req.session.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
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
      isInWishlist
    });
  } catch (error) {
    console.error('Error toggling wishlist:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating wishlist' 
    });
  }
};

module.exports = {
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
};
