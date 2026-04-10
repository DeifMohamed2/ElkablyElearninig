/**
 * Advansys Telecom Bulk SMS (ForwardBulkSMS / ForwardSMS)
 *
 * Environment (set in .env — never commit secrets):
 * - SMS_API_TOKEN — Authorization header value (plain token, no Bearer prefix)
 * - SMS_SENDER_NAME — Registered sender name with Advansys (required for API)
 * - SMS_ENABLED — "true" to allow sending (default: false)
 * - SMS_DEFAULT_OPERATOR_ID — Optional "1"|"2"|"3"|"7" when prefix unknown
 * - SMS_DELIVERY_MODE — parallel (default) | fallback | sms_only — parallel = always FCM + SMS, independent
 * - SMS_API_URL — Override endpoint (default: ForwardBulkSMS)
 * - SMS_FALLBACK_URL — Override ForwardSMS fallback (default: hubapi ForwardSMS)
 * - SMS_DISABLE_FALLBACK — "true" to skip ForwardSMS retry when ForwardBulkSMS fails
 * - SMS_BULK_FORMAT — phoneNumbers (default, portal bulk) | flat | messages
 * - SMS_PHONE_NUMBERS_AS_STRING — "true" to send PhoneNumbers as newline-separated string (default: JSON array per hubapi)
 * - SMS_DEBUG — "true" to log HTTP status and response body (never logs token)
 *
 * Default API: POST https://hubapi.advansystelecom.com/api/bulkSMS/ForwardBulkSMS
 * Fallback (if bulk fails): SMS_FALLBACK_URL or hubapi ForwardSMS (same JSON as PDF).
 * Legacy PDF URL: https://hub.advansystelecom.com/generalapiv12/api/bulkSMS/ForwardSMS
 *
 * Public API (Elkably compatibility): sendSms({ recipient, message, senderId?, type?, requestId? }) throws on failure.
 */

const axios = require('axios');

const DEFAULT_SMS_API_URL =
  'https://hubapi.advansystelecom.com/api/bulkSMS/ForwardBulkSMS';

/** Same contract as Integration.pdf — single-message JSON */
const DEFAULT_SMS_FALLBACK_URL =
  'https://hubapi.advansystelecom.com/api/bulkSMS/ForwardSMS';

function getSmsApiUrl() {
  return process.env.SMS_API_URL || DEFAULT_SMS_API_URL;
}

function getSmsFallbackUrl() {
  return (
    process.env.SMS_FALLBACK_URL ||
    DEFAULT_SMS_FALLBACK_URL
  );
}

function isForwardBulkUrl(url) {
  return /ForwardBulkSMS/i.test(String(url || ''));
}

function getSmsDisableFallback() {
  return isTruthyEnv(process.env.SMS_DISABLE_FALLBACK);
}

/**
 * Portal ForwardBulkSMS: PhoneNumbers + Message (see Advansys dashboard).
 * @returns {'phoneNumbers'|'flat'|'messages'}
 */
function getSmsBulkFormat() {
  const m = (process.env.SMS_BULK_FORMAT || 'phoneNumbers').trim().toLowerCase();
  if (m === 'messages' || m === 'array') return 'messages';
  if (m === 'flat') return 'flat';
  if (
    m === 'phonenumbers' ||
    m === 'phone_numbers' ||
    m === 'dashboard'
  ) {
    return 'phoneNumbers';
  }
  return 'phoneNumbers';
}

/** Random 5-digit RequestID for Advansys (10000–99999). */
function generateAdvansysRequestId() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

/**
 * Use explicit 5-digit id if provided; otherwise generate (portal expects short numeric RequestID).
 */
function resolveAdvansysRequestId(requestId) {
  if (requestId !== undefined && requestId !== null) {
    const s = String(requestId).trim();
    if (/^\d{5}$/.test(s)) return s;
  }
  return generateAdvansysRequestId();
}

/** Max single message length (UTF-8); longer text is truncated with ellipsis */
const SMS_MAX_LENGTH = 900;

const OPERATOR = {
  VODAFONE: 1,
  ORANGE: 2,
  ETISALAT: 3,
  WE: 7,
};

/**
 * Egyptian mobile prefixes (after country code 20) → OperatorID
 * 010 Vodafone, 011 Etisalat, 012 Orange, 015 WE — standard assignment
 */
const PREFIX_TO_OPERATOR = {
  10: OPERATOR.VODAFONE,
  11: OPERATOR.ETISALAT,
  12: OPERATOR.ORANGE,
  15: OPERATOR.WE,
};

function isTruthyEnv(val) {
  if (val === undefined || val === null) return false;
  const s = String(val).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

function isSmsDebug() {
  return isTruthyEnv(process.env.SMS_DEBUG);
}

function getSmsEnabled() {
  return isTruthyEnv(process.env.SMS_ENABLED);
}

function getSmsToken() {
  return process.env.SMS_API_TOKEN || process.env.ADVANSYS_SMS_TOKEN || '';
}

function getSenderName() {
  return (process.env.SMS_SENDER_NAME || '').trim();
}

/**
 * @returns {'parallel'|'fallback'|'sms_only'}
 */
function getSmsDeliveryMode() {
  const m = (process.env.SMS_DELIVERY_MODE || 'parallel').trim().toLowerCase();
  if (m === 'parallel' || m === 'sms_only' || m === 'fallback') return m;
  return 'parallel';
}

function getDefaultOperatorId() {
  const raw = process.env.SMS_DEFAULT_OPERATOR_ID;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = parseInt(String(raw).trim(), 10);
  if ([1, 2, 3, 7].includes(n)) return n;
  return null;
}

/**
 * Strip non-digits from phone string
 */
function digitsOnly(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

/**
 * Normalize to Egypt international format: 20 + 10 digits (mobile)
 * Accepts 01xxxxxxxxx, 20xxxxxxxxxx, +20...
 * @returns {{ ok: boolean, international?: string, error?: string }}
 */
function normalizeEgyptInternational(phone) {
  let d = digitsOnly(phone);
  if (!d) {
    return { ok: false, error: 'Empty phone number' };
  }

  // Remove leading 00
  if (d.startsWith('00')) d = d.slice(2);

  // +20 concatenated with local 01xxxxxxxxx → "200" + 10 digits (13 total); drop duplicate 0
  if (d.length === 13 && d.startsWith('200')) {
    d = `20${d.slice(3)}`;
  }

  // +20 concatenated with number that already included 20 → "2020" + 10 digits (14 total)
  if (d.length === 14 && d.startsWith('2020')) {
    d = d.slice(2);
  }

  // Already 20 + 10 digits
  if (d.startsWith('20') && d.length === 12) {
    return { ok: true, international: d };
  }

  // Local mobile 1XXXXXXXXX (10 digits after dropping leading 0)
  if (d.startsWith('0') && d.length === 11 && d[1] === '1') {
    return { ok: true, international: `20${d.slice(1)}` };
  }

  // Missing country code: 1XXXXXXXXX (10 digits starting with 1)
  if (d.length === 10 && d[0] === '1') {
    return { ok: true, international: `20${d}` };
  }

  // 12 digits not starting with 20
  if (d.length === 12 && !d.startsWith('20')) {
    return { ok: false, error: 'Unsupported international format' };
  }

  return { ok: false, error: 'Could not normalize to Egypt mobile (20 + 10 digits)' };
}

/**
 * Infer OperatorID from normalized 20XXXXXXXXXX number.
 * Egypt: after 20, the next two digits are the carrier code — 010→10, 011→11, 012→12, 015→15.
 * @param {string} international - 12 digits starting with 20
 * @returns {{ operatorId: number|null, prefix: string|null }}
 */
function inferOperatorId(international) {
  if (!international || international.length !== 12 || !international.startsWith('20')) {
    return { operatorId: null, prefix: null };
  }
  const two = international.slice(2, 4);
  const prefixNum = parseInt(two, 10);
  const op = PREFIX_TO_OPERATOR[prefixNum];
  const three = international.slice(2, 5);
  if (op) return { operatorId: op, prefix: three };
  return { operatorId: null, prefix: three };
}

function resolveOperatorId(phoneInternational) {
  const { operatorId, prefix } = inferOperatorId(phoneInternational);
  if (operatorId) return { operatorId, source: 'prefix' };

  const fallback = getDefaultOperatorId();
  if (fallback) {
    console.warn(
      `[SMS] Unknown mobile prefix "${prefix}" for ${phoneInternational.slice(0, 5)}… — using SMS_DEFAULT_OPERATOR_ID=${fallback}`,
    );
    return { operatorId: fallback, source: 'default' };
  }

  console.error(
    `[SMS] Cannot infer operator for ${phoneInternational.slice(0, 5)}… — set SMS_DEFAULT_OPERATOR_ID or fix number`,
  );
  return { operatorId: null, source: 'none' };
}

function truncateMessage(text, maxLen = SMS_MAX_LENGTH) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

/**
 * JSON body for Advansys single or bulk endpoint.
 * phoneNumbers: portal ForwardBulkSMS — SenderName, RequestID, PhoneNumbers, Message.
 * flat: ForwardSMS one-to-one — PhoneNumber, Message, SenderName, RequestID, OperatorID.
 * messages: legacy array wrapper.
 * @param {'phoneNumbers'|'flat'|'messages'} [p.format] — overrides env SMS_BULK_FORMAT
 */
function buildSmsApiBody(p) {
  const {
    intl,
    message,
    senderName,
    requestId,
    operatorId,
    format,
    extraPhoneNumbers,
  } = p;
  const msg = truncateMessage(String(message));
  const rid = String(requestId);
  const fmt = format || getSmsBulkFormat();

  if (fmt === 'phoneNumbers') {
    const lines =
      Array.isArray(extraPhoneNumbers) && extraPhoneNumbers.length > 0
        ? [intl, ...extraPhoneNumbers.map((n) => digitsOnly(n))].filter(Boolean)
        : [intl];
    const phoneNumbersValue = isTruthyEnv(process.env.SMS_PHONE_NUMBERS_AS_STRING)
      ? lines.join('\n')
      : lines;
    return {
      SenderName: senderName,
      RequestID: rid,
      PhoneNumbers: phoneNumbersValue,
      Message: msg,
    };
  }

  if (fmt === 'messages') {
    return {
      SenderName: senderName,
      Messages: [
        {
          PhoneNumber: intl,
          Message: msg,
          RequestID: rid,
          OperatorID: operatorId,
        },
      ],
    };
  }

  return {
    PhoneNumber: intl,
    Message: msg,
    SenderName: senderName,
    RequestID: rid,
    OperatorID: operatorId,
  };
}

/**
 * Parse API response body (numeric success / error code).
 * Plain PDF format: body is a number (1 = success).
 * Advansys v12 often returns JSON like { "Message": "0" } or { "Message": "1" } where
 * Message is the status code (not the SMS text). "0" is treated as success alongside 1.
 */
function parseSmsResponseCode(data) {
  if (data === null || data === undefined) return { code: null, raw: data };
  if (typeof data === 'number' && Number.isFinite(data)) {
    return { code: data, raw: data };
  }
  if (typeof data === 'string') {
    const n = parseInt(data.trim(), 10);
    if (!Number.isNaN(n)) return { code: n, raw: data };
  }
  if (typeof data === 'object' && data !== null) {
    const keys = [
      'code',
      'Code',
      'status',
      'Status',
      'result',
      'Result',
      'Message',
      'message',
    ];
    for (const k of keys) {
      if (data[k] !== undefined && data[k] !== null) {
        const n = parseInt(String(data[k]).trim(), 10);
        if (!Number.isNaN(n)) return { code: n, raw: data };
      }
    }
  }
  return { code: null, raw: data };
}

/** HTTP API success: PDF says 1; JSON { Message: "0" } is also accepted from provider */
function isSmsApiSuccess(code) {
  return code === 1 || code === 0;
}

/**
 * Some Advansys hubapi deployments return HTTP 400 with body { Message: "0" } for accepted sends.
 */
function isSmsTransportOk(httpStatus, code) {
  if (httpStatus >= 200 && httpStatus < 300) return true;
  if (httpStatus === 400 && isSmsApiSuccess(code)) return true;
  return false;
}

function logSmsErrorCode(code) {
  const map = {
    [-1]: 'Invalid authorization token',
    [-2]: 'Empty mobile number',
    [-3]: 'Empty message',
    [-4]: 'Invalid sender (check SMS_SENDER_NAME registration)',
    [-5]: 'No credit available for account',
  };
  const msg = map[code] || `Unknown code ${code}`;
  console.error(`[SMS] API error: ${msg}`);
}

function evaluateAdvansysHttpResponse(res, url, usedFallback, intl, advRequestId) {
  const httpStatus = res.status;
  const { code, raw } = parseSmsResponseCode(res.data);
  const apiOk = isSmsApiSuccess(code);
  const transportOk = isSmsTransportOk(httpStatus, code);
  const success = transportOk && apiOk;

  if (isSmsDebug()) {
    console.log(
      `[SMS] debug url=${url} fallback=${usedFallback} http=${httpStatus} phone=${intl.slice(0, 5)}… data=${typeof res.data === 'object' ? JSON.stringify(res.data) : String(res.data)}`,
    );
  }

  if (!transportOk) {
    console.error(
      `[SMS] HTTP ${httpStatus}:`,
      typeof res.data === 'object' ? JSON.stringify(res.data) : res.data,
    );
  } else if (!success) {
    if (code !== null) logSmsErrorCode(code);
    else
      console.error(
        '[SMS] Unexpected response:',
        typeof raw === 'object' ? JSON.stringify(raw) : raw,
      );
  } else {
    console.log(
      `[SMS] Sent OK RequestID=${advRequestId} → ${intl.slice(0, 5)}…`,
    );
  }

  return {
    success,
    code: code !== null ? code : null,
    message: success
      ? 'Message is sent successfully'
      : !transportOk
        ? `HTTP ${httpStatus}`
        : 'Send failed',
    raw,
    httpStatus,
    url,
    usedFallback,
  };
}

/**
 * Send one SMS via Advansys (ForwardBulkSMS by default)
 * @param {object} opts
 * @param {string} opts.phoneNumber - Any format accepted by normalizeEgyptInternational
 * @param {string} opts.message - UTF-8 body
 * @param {string|number} opts.requestId - Unique per request (idempotency / tracking)
 * @param {number} [opts.operatorId] - Optional override
 * @returns {Promise<{ success: boolean, code: number|null, message: string, raw?: any, httpStatus?: number, url?: string, usedFallback?: boolean, advRequestId?: string }>}
 */
async function sendAdvansysSms(opts) {
  const { phoneNumber, message, requestId, operatorId: operatorOverride } = opts;

  if (!getSmsEnabled()) {
    return {
      success: false,
      code: null,
      message: 'SMS is disabled (SMS_ENABLED)',
    };
  }

  const token = getSmsToken();
  const senderName = getSenderName();

  if (!token) {
    console.error('[SMS] Missing SMS_API_TOKEN (or ADVANSYS_SMS_TOKEN)');
    return {
      success: false,
      code: -1,
      message: 'Missing API token',
    };
  }

  if (!senderName) {
    console.error('[SMS] Missing SMS_SENDER_NAME');
    return {
      success: false,
      code: -4,
      message: 'Missing sender name',
    };
  }

  if (!message || !String(message).trim()) {
    return {
      success: false,
      code: -3,
      message: 'Empty message',
    };
  }

  const norm = normalizeEgyptInternational(phoneNumber);
  if (!norm.ok) {
    return {
      success: false,
      code: -2,
      message: norm.error || 'Invalid phone',
    };
  }

  const intl = norm.international;
  const advRequestId = resolveAdvansysRequestId(requestId);

  let operatorId = operatorOverride;
  if (operatorId === undefined || operatorId === null) {
    const resolved = resolveOperatorId(intl);
    if (!resolved.operatorId) {
      return {
        success: false,
        code: -2,
        message: 'Could not determine mobile operator',
      };
    }
    operatorId = resolved.operatorId;
  }

  const bodyPrimary = buildSmsApiBody({
    intl,
    message,
    senderName,
    requestId: advRequestId,
    operatorId,
  });
  const bodyFlat = buildSmsApiBody({
    intl,
    message,
    senderName,
    requestId: advRequestId,
    operatorId,
    format: 'flat',
  });

  const axiosOpts = {
    headers: {
      Authorization: token,
      'Content-Type': 'application/json; charset=utf-8',
    },
    timeout: 30000,
    validateStatus: () => true,
  };

  try {
    const primaryUrl = getSmsApiUrl();
    let res = await axios.post(primaryUrl, bodyPrimary, axiosOpts);
    let out = evaluateAdvansysHttpResponse(res, primaryUrl, false, intl, advRequestId);

    const fbUrl = getSmsFallbackUrl();
    if (
      !out.success &&
      isForwardBulkUrl(primaryUrl) &&
      !getSmsDisableFallback() &&
      fbUrl &&
      fbUrl !== primaryUrl
    ) {
      console.warn(
        `[SMS] ForwardBulkSMS failed; retrying with ForwardSMS fallback: ${fbUrl}`,
      );
      res = await axios.post(fbUrl, bodyFlat, axiosOpts);
      out = evaluateAdvansysHttpResponse(res, fbUrl, true, intl, advRequestId);
    }

    return {
      success: out.success,
      code: out.code,
      message: out.message,
      raw: out.raw,
      httpStatus: out.httpStatus,
      url: out.url,
      usedFallback: out.usedFallback,
      advRequestId,
    };
  } catch (err) {
    const msg = err.response?.data ?? err.message;
    const httpStatus = err.response?.status;
    console.error('[SMS] HTTP error:', err.message);
    if (err.response?.data !== undefined) {
      console.error(
        '[SMS] error body:',
        typeof err.response.data === 'object'
          ? JSON.stringify(err.response.data)
          : err.response.data,
      );
    }
    return {
      success: false,
      code: null,
      message: err.message || 'Request failed',
      raw: msg,
      httpStatus,
    };
  }
}

/**
 * Convenience: send SMS with auto 5-digit RequestID when omitted
 */
async function sendSmsPlain(phone, message, requestId) {
  return sendAdvansysSms({ phoneNumber: phone, message, requestId });
}

/**
 * Elkably legacy API: WhySMS-style shape; throws on failure (for OTP / admin flows).
 * senderId and type are ignored; Advansys sender is SMS_SENDER_NAME.
 */
async function sendSms({
  recipient,
  message,
  senderId: _senderId,
  type: _type,
  requestId,
} = {}) {
  if (!recipient || !message) {
    throw new Error('recipient and message are required');
  }

  const envSender = getSenderName();
  if (_senderId && envSender && String(_senderId).trim() !== envSender) {
    console.warn(
      `[SMS] senderId "${_senderId}" ignored; using SMS_SENDER_NAME="${envSender}"`,
    );
  }

  const result = await sendAdvansysSms({
    phoneNumber: recipient,
    message,
    requestId,
  });

  if (!result.success) {
    const err = new Error(result.message || 'SMS send failed');
    err.details = result.raw !== undefined ? result.raw : result;
    err.isApiError = true;
    err.code = result.code;
    err.httpStatus = result.httpStatus;
    throw err;
  }

  return {
    status: 'success',
    advRequestId: result.advRequestId,
    raw: result.raw,
    message: result.message,
  };
}

/**
 * Send the same message to multiple Egyptian mobiles via one ForwardBulkSMS request.
 * Throws on validation or API failure (same contract as legacy sendBulkSms).
 */
async function sendBulkSms({
  recipients,
  message,
  senderId: _senderId,
  type: _type,
  requestId,
} = {}) {
  if (!recipients || !message) {
    throw new Error('recipients and message are required');
  }

  const list = Array.isArray(recipients) ? recipients : [recipients];
  const intls = [];
  for (const r of list) {
    const norm = normalizeEgyptInternational(r);
    if (!norm.ok) {
      const err = new Error(norm.error || 'Invalid phone');
      err.isApiError = true;
      err.details = { recipient: r };
      throw err;
    }
    intls.push(norm.international);
  }

  if (intls.length === 1) {
    return sendSms({ recipient: list[0], message, requestId });
  }

  if (!getSmsEnabled()) {
    const err = new Error('SMS is disabled (SMS_ENABLED)');
    err.isApiError = true;
    err.details = {};
    throw err;
  }

  const token = getSmsToken();
  const senderName = getSenderName();

  if (!token) {
    const err = new Error('Missing API token');
    err.isApiError = true;
    err.code = -1;
    throw err;
  }

  if (!senderName) {
    const err = new Error('Missing sender name');
    err.isApiError = true;
    err.code = -4;
    throw err;
  }

  const envSender = getSenderName();
  if (_senderId && envSender && String(_senderId).trim() !== envSender) {
    console.warn(
      `[SMS] senderId "${_senderId}" ignored; using SMS_SENDER_NAME="${envSender}"`,
    );
  }

  const advRequestId = resolveAdvansysRequestId(requestId);
  const bodyPrimary = buildSmsApiBody({
    intl: intls[0],
    message,
    senderName,
    requestId: advRequestId,
    operatorId: OPERATOR.VODAFONE,
    format: 'phoneNumbers',
    extraPhoneNumbers: intls.slice(1),
  });

  const axiosOpts = {
    headers: {
      Authorization: token,
      'Content-Type': 'application/json; charset=utf-8',
    },
    timeout: 30000,
    validateStatus: () => true,
  };

  try {
    const primaryUrl = getSmsApiUrl();
    const res = await axios.post(primaryUrl, bodyPrimary, axiosOpts);
    const out = evaluateAdvansysHttpResponse(
      res,
      primaryUrl,
      false,
      intls[0],
      advRequestId,
    );

    if (!out.success) {
      const err = new Error(out.message || 'SMS bulk send failed');
      err.details = out.raw !== undefined ? out.raw : out;
      err.isApiError = true;
      err.code = out.code;
      err.httpStatus = out.httpStatus;
      throw err;
    }

    return {
      status: 'success',
      advRequestId,
      raw: out.raw,
      recipientCount: intls.length,
    };
  } catch (err) {
    if (err.isApiError) throw err;
    const msg = err.response?.data ?? err.message;
    const e = new Error(err.message || 'Request failed');
    e.details = msg;
    e.isApiError = true;
    e.httpStatus = err.response?.status;
    throw e;
  }
}

module.exports = {
  DEFAULT_SMS_API_URL,
  DEFAULT_SMS_FALLBACK_URL,
  getSmsApiUrl,
  getSmsFallbackUrl,
  getSmsDisableFallback,
  isForwardBulkUrl,
  generateAdvansysRequestId,
  resolveAdvansysRequestId,
  SMS_MAX_LENGTH,
  OPERATOR,
  getSmsEnabled,
  getSmsDeliveryMode,
  getSmsToken,
  getSenderName,
  getSmsBulkFormat,
  buildSmsApiBody,
  isSmsDebug,
  normalizeEgyptInternational,
  inferOperatorId,
  resolveOperatorId,
  truncateMessage,
  parseSmsResponseCode,
  isSmsApiSuccess,
  isSmsTransportOk,
  sendAdvansysSms,
  sendSms,
  sendSmsPlain,
  sendBulkSms,
  digitsOnly,
};
