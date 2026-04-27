const { rateLimit, MemoryStore, ipKeyGenerator } = require('express-rate-limit');

/**
 * Shared stores so burst + hourly limits apply to the same client key across
 * all OTP-related routes (mobile API, web auth, student profile).
 */
const burstStore = new MemoryStore();
const hourlyStore = new MemoryStore();

function clientIpKey(req) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return ipKeyGenerator(ip);
}

const json429 = {
  success: false,
  message:
    'Too many verification code requests from this network. Please wait a few minutes and try again.',
};

function buildLimiter({ windowMs, max, store, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    keyGenerator: clientIpKey,
    message,
    handler: (req, res, _next, options) => {
      res.status(options.statusCode).json(options.message);
    },
  });
}

const burstMax = Math.max(
  1,
  Number(process.env.OTP_IP_BURST_MAX) || 10,
);
const burstWindowMs = Math.max(
  1000,
  Number(process.env.OTP_IP_BURST_WINDOW_MS) || 60 * 1000,
);

const hourlyMax = Math.max(
  burstMax,
  Number(process.env.OTP_IP_HOURLY_MAX) || 35,
);
const hourlyWindowMs = Math.max(
  burstWindowMs,
  Number(process.env.OTP_IP_HOURLY_WINDOW_MS) || 60 * 60 * 1000,
);

/** Short window: blocks rapid-fire scripts (many numbers in seconds). */
const otpBurstLimiter = buildLimiter({
  windowMs: burstWindowMs,
  max: burstMax,
  store: burstStore,
  message: json429,
});

/** Longer window: caps total OTP traffic per IP per hour (NAT-friendly default). */
const otpHourlyLimiter = buildLimiter({
  windowMs: hourlyWindowMs,
  max: hourlyMax,
  store: hourlyStore,
  message: json429,
});

/** Chain on any route that triggers SMS / WhatsApp verification sends. */
function otpSendIpRateLimit(req, res, next) {
  otpBurstLimiter(req, res, (err) => {
    if (err) return next(err);
    otpHourlyLimiter(req, res, next);
  });
}

module.exports = {
  otpBurstLimiter,
  otpHourlyLimiter,
  otpSendIpRateLimit,
};
