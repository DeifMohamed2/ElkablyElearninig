/**
 * Simple In-Memory Cache
 * Lightweight caching for frequently accessed data (dashboard stats, filter options, etc.)
 */

class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
  }

  /**
   * Get a cached value
   * @param {string} key
   * @returns {*} cached value or undefined
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) return undefined;
    if (Date.now() > item.expiry) {
      this.delete(key);
      return undefined;
    }
    return item.value;
  }

  /**
   * Set a cached value
   * @param {string} key
   * @param {*} value
   * @param {number} ttlSeconds - Time to live in seconds (default 60)
   */
  set(key, value, ttlSeconds = 60) {
    // Clear existing timer
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    const expiry = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, { value, expiry });

    // Auto-cleanup after expiry
    const timer = setTimeout(() => {
      this.cache.delete(key);
      this.timers.delete(key);
    }, ttlSeconds * 1000);

    // Don't prevent Node.js from exiting
    if (timer.unref) timer.unref();
    this.timers.set(key, timer);
  }

  /**
   * Delete a cached value
   * @param {string} key
   */
  delete(key) {
    this.cache.delete(key);
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
  }

  /**
   * Clear all cached values
   */
  clear() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.cache.clear();
    this.timers.clear();
  }

  /**
   * Get or set - returns cached value if exists, otherwise calls fn and caches result
   * @param {string} key
   * @param {Function} fn - async function to call if cache miss
   * @param {number} ttlSeconds
   * @returns {*}
   */
  async getOrSet(key, fn, ttlSeconds = 60) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const value = await fn();
    this.set(key, value, ttlSeconds);
    return value;
  }
}

// Singleton instance
const cache = new MemoryCache();

module.exports = cache;
