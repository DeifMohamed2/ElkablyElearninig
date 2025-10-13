const mongoose = require('mongoose');

const teamMemberSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Team member name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  position: {
    type: String,
    required: [true, 'Team member position is required'],
    trim: true,
    maxlength: [50, 'Position cannot exceed 50 characters']
  },
  image: {
    type: String,
    default: null,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(v);
      },
      message: 'Image must be a valid URL'
    }
  },
  fallbackInitials: {
    type: String,
    required: [true, 'Fallback initials are required'],
    trim: true,
    uppercase: true,
    maxlength: [5, 'Fallback initials cannot exceed 5 characters']
  },
  displayOrder: {
    type: Number,
    default: 0,
    min: [0, 'Display order cannot be negative']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for better query performance
teamMemberSchema.index({ displayOrder: 1, isActive: 1 });
teamMemberSchema.index({ isActive: 1 });

// Virtual for full image URL
teamMemberSchema.virtual('imageUrl').get(function() {
  if (this.image) {
    return this.image;
  }
  return null;
});

// Instance method to get display name
teamMemberSchema.methods.getDisplayName = function() {
  return this.name;
};

// Static method to get active team members ordered by display order
teamMemberSchema.statics.getActiveMembers = function() {
  return this.find({ isActive: true })
    .sort({ displayOrder: 1, createdAt: 1 })
    .select('name position image fallbackInitials displayOrder');
};

// Static method to get team members for admin
teamMemberSchema.statics.getForAdmin = function(page = 1, limit = 10, filters = {}) {
  const query = {};
  
  // Apply filters
  if (filters.search) {
    query.$or = [
      { name: { $regex: filters.search, $options: 'i' } },
      { position: { $regex: filters.search, $options: 'i' } }
    ];
  }
  
  if (filters.isActive !== undefined && filters.isActive !== '') {
    query.isActive = filters.isActive === 'true';
  }

  const skip = (page - 1) * limit;
  
  return Promise.all([
    this.find(query)
      .sort({ displayOrder: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    this.countDocuments(query)
  ]);
};

// Pre-save middleware to ensure fallback initials are uppercase
teamMemberSchema.pre('save', function(next) {
  if (this.fallbackInitials) {
    this.fallbackInitials = this.fallbackInitials.toUpperCase();
  }
  next();
});

// Pre-save middleware to auto-generate fallback initials if not provided
teamMemberSchema.pre('save', function(next) {
  if (!this.fallbackInitials && this.name) {
    const nameParts = this.name.trim().split(' ');
    if (nameParts.length >= 2) {
      this.fallbackInitials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
    } else {
      this.fallbackInitials = this.name.substring(0, 2).toUpperCase();
    }
  }
  next();
});

const TeamMember = mongoose.model('TeamMember', teamMemberSchema);

module.exports = TeamMember;
