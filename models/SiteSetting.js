const mongoose = require('mongoose');

const SiteSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true }
);

SiteSettingSchema.index({ key: 1 });

SiteSettingSchema.statics.get = async function (key) {
  const doc = await this.findOne({ key }).lean();
  return doc ? doc.value : undefined;
};

SiteSettingSchema.statics.set = async function (key, value) {
  await this.findOneAndUpdate(
    { key },
    { key, value },
    { upsert: true, new: true }
  );
};

module.exports = mongoose.model('SiteSetting', SiteSettingSchema);
