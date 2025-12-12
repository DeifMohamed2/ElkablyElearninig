const mongoose = require('mongoose');

const BookOrderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    bundle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BundleCourse',
      required: true,
    },
    bookName: {
      type: String,
      required: true,
      trim: true,
    },
    bookPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    purchase: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Purchase',
      required: true,
    },
    orderNumber: {
      type: String,
      required: true,
      index: true,
    },
    shippingAddress: {
      firstName: {
        type: String,
        required: true,
      },
      lastName: {
        type: String,
        required: true,
      },
      email: {
        type: String,
        required: true,
      },
      phone: {
        type: String,
        required: true,
      },
      address: {
        type: String,
        required: true,
      },
      city: {
        type: String,
        required: true,
      },
      state: {
        type: String,
        required: true,
      },
      zipCode: {
        type: String,
        required: true,
      },
      country: {
        type: String,
        required: true,
      },
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },
    shippedAt: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },
    trackingNumber: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better query performance
BookOrderSchema.index({ user: 1, bundle: 1 });
BookOrderSchema.index({ status: 1 });
BookOrderSchema.index({ orderNumber: 1 });
BookOrderSchema.index({ createdAt: -1 });

// Virtual for status display
BookOrderSchema.virtual('statusDisplay').get(function () {
  const statusMap = {
    pending: 'Pending',
    processing: 'Processing',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  };
  return statusMap[this.status] || this.status;
});

// Static method to check if user has ordered a book for a bundle
// Only returns true if the book order has a completed payment
BookOrderSchema.statics.hasUserOrderedBook = async function (userId, bundleId) {
  const order = await this.findOne({
    user: userId,
    bundle: bundleId,
    status: { $ne: 'cancelled' },
  }).populate('purchase', 'paymentStatus');
  
  // Only consider it ordered if the associated purchase payment is completed
  if (order && order.purchase && order.purchase.paymentStatus === 'completed') {
    return true;
  }
  
  return false;
};

// Static method to get user book orders
BookOrderSchema.statics.getUserBookOrders = function (userId, options = {}) {
  const query = { user: userId };

  if (options.status) {
    query.status = options.status;
  }

  return this.find(query)
    .populate('bundle', 'title bundleCode thumbnail')
    .populate('purchase', 'orderNumber paymentStatus')
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('BookOrder', BookOrderSchema);

