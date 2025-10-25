const mongoose = require('mongoose');

const promoCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    minlength: 3,
    maxlength: 20
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true,
    default: 'percentage'
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0
  },
  maxDiscountAmount: {
    type: Number,
    default: null // For percentage discounts, limit the maximum discount amount
  },
  minOrderAmount: {
    type: Number,
    default: 0 // Minimum order amount to use this promo code
  },
  maxUses: {
    type: Number,
    default: null // null means unlimited uses
  },
  currentUses: {
    type: Number,
    default: 0
  },
  allowMultipleUses: {
    type: Boolean,
    default: false // false = one use per user, true = multiple uses per user
  },
  validFrom: {
    type: Date,
    required: true,
    default: Date.now
  },
  validUntil: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  applicableTo: {
    type: String,
    enum: ['all', 'bundles', 'courses'],
    default: 'all'
  },
  specificItems: [{
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'specificItemsModel'
  }],
  specificItemsModel: {
    type: String,
    enum: ['BundleCourse', 'Course'],
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  usageHistory: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    purchase: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Purchase',
      required: true
    },
    discountAmount: {
      type: Number,
      required: true
    },
    originalAmount: {
      type: Number,
      required: true
    },
    finalAmount: {
      type: Number,
      required: true
    },
    usedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Index for better performance
promoCodeSchema.index({ code: 1 });
promoCodeSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 });
promoCodeSchema.index({ 'usageHistory.user': 1 });

// Virtual for checking if promo code is valid
promoCodeSchema.virtual('isValid').get(function() {
  const now = new Date();
  return this.isActive && 
         this.validFrom <= now && 
         this.validUntil >= now && 
         (this.maxUses === null || this.currentUses < this.maxUses);
});

// Virtual for remaining uses
promoCodeSchema.virtual('remainingUses').get(function() {
  if (this.maxUses === null) return 'Unlimited';
  return Math.max(0, this.maxUses - this.currentUses);
});

// Method to check if user can use this promo code
promoCodeSchema.methods.canUserUse = function(userId) {
  // If allowMultipleUses is true, user can use it multiple times
  if (this.allowMultipleUses) {
    return this.isValid;
  }
  
  // If allowMultipleUses is false, check if user has already used this promo code
  const hasUsed = this.usageHistory.some(usage => 
    usage.user.toString() === userId.toString()
  );
  
  return !hasUsed && this.isValid;
};

// Method to calculate discount amount
promoCodeSchema.methods.calculateDiscount = function(orderAmount, items = []) {
  if (!this.isValid) {
    throw new Error('Promo code is not valid');
  }

  if (orderAmount < this.minOrderAmount) {
    throw new Error(`Minimum order amount of ${this.minOrderAmount} EGP required`);
  }

  // Check if applicable to items
  if (this.applicableTo !== 'all') {
    const hasApplicableItems = items.some(item => {
      if (this.applicableTo === 'bundles' && item.type === 'bundle') return true;
      if (this.applicableTo === 'courses' && item.type === 'course') return true;
      return false;
    });

    if (!hasApplicableItems) {
      throw new Error(`This promo code is only applicable to ${this.applicableTo}`);
    }
  }

  // Check specific items if any
  if (this.specificItems && this.specificItems.length > 0) {
    const hasSpecificItems = items.some(item => 
      this.specificItems.some(specificId => 
        specificId.toString() === item.id.toString()
      )
    );

    if (!hasSpecificItems) {
      throw new Error('This promo code is not applicable to the selected items');
    }
  }

  let discountAmount = 0;

  if (this.discountType === 'percentage') {
    discountAmount = (orderAmount * this.discountValue) / 100;
    
    // Apply maximum discount limit if set
    if (this.maxDiscountAmount && discountAmount > this.maxDiscountAmount) {
      discountAmount = this.maxDiscountAmount;
    }
  } else {
    // Fixed amount discount
    discountAmount = Math.min(this.discountValue, orderAmount);
  }

  return Math.round(discountAmount * 100) / 100; // Round to 2 decimal places
};

// Method to apply promo code
promoCodeSchema.methods.applyPromoCode = function(userId, purchaseId, orderAmount, items = []) {
  if (!this.canUserUse(userId)) {
    throw new Error('User cannot use this promo code');
  }

  const discountAmount = this.calculateDiscount(orderAmount, items);
  const finalAmount = orderAmount - discountAmount;

  // Add to usage history
  this.usageHistory.push({
    user: userId,
    purchase: purchaseId,
    discountAmount,
    originalAmount: orderAmount,
    finalAmount
  });

  // Increment current uses
  this.currentUses += 1;

  return {
    discountAmount,
    finalAmount,
    promoCode: this.code
  };
};

// Static method to generate random promo code
promoCodeSchema.statics.generateRandomCode = function(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
};

// Static method to find valid promo code
promoCodeSchema.statics.findValidPromoCode = async function(code, userId) {
  const promoCode = await this.findOne({ 
    code: code.toUpperCase(),
    isActive: true 
  });

  if (!promoCode) {
    throw new Error('Promo code not found');
  }

  if (!promoCode.canUserUse(userId)) {
    throw new Error('You have already used this promo code or it is not valid');
  }

  return promoCode;
};

// Pre-save middleware to ensure code is uppercase
promoCodeSchema.pre('save', function(next) {
  if (this.isModified('code')) {
    this.code = this.code.toUpperCase();
  }
  next();
});

// Pre-save middleware to validate discount value
promoCodeSchema.pre('save', function(next) {
  if (this.discountType === 'percentage' && this.discountValue > 100) {
    return next(new Error('Percentage discount cannot exceed 100%'));
  }
  next();
});

module.exports = mongoose.model('PromoCode', promoCodeSchema);
