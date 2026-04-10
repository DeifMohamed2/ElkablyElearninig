const BundleCourse = require('../models/BundleCourse');

let ensured = false;

/**
 * Backfills storefrontOrder and showOnHomepage on existing documents once per process
 * so MongoDB compound sorts behave predictably.
 */
async function ensureBundleStorefrontDefaults() {
  if (ensured) return;
  ensured = true;
  try {
    await BundleCourse.updateMany({}, [
      {
        $set: {
          storefrontOrder: { $ifNull: ['$storefrontOrder', 0] },
          showOnHomepage: { $ifNull: ['$showOnHomepage', true] },
        },
      },
    ]);
  } catch (err) {
    ensured = false;
    console.error('ensureBundleStorefrontDefaults:', err.message);
  }
}

module.exports = ensureBundleStorefrontDefaults;
