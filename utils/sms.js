const axios = require('axios');

const WHY_SMS_API_URL = 'https://bulk.whysms.com/api/v3/sms/send';
const WHY_SMS_TOKEN = process.env.WHY_SMS_TOKEN;
const DEFAULT_SENDER_ID = 'ELKABLYTEAM';

function normalizeRecipient(recipient) {
  // Trim spaces and leading '+'
  let r = String(recipient).trim().replace(/^\+/, '');
  
  // Remove all non-digit characters first
  let digits = r.replace(/\D/g, '');
  
  // Convert local Egyptian mobile like 01XXXXXXXXX to 201XXXXXXXXX
  if (/^0\d{10}$/.test(digits)) {
    return `20${digits.slice(1)}`;
  }
  
  // Handle Egyptian numbers with country code 20
  if (digits.startsWith('20')) {
    const after20 = digits.slice(2); // Get everything after "20"
    
    // Fix cases like 2001055200152 (two zeros) to 201055200152 (one zero)
    // If starts with "00" (two zeros), remove one zero
    if (after20.startsWith('00')) {
      const fixed = after20.slice(1); // Remove one zero: 00... -> 0...
      // Should have 10 digits total after 20: 20 + 0 + 9 digits = 12 digits
      if (/^\d{10}$/.test(fixed)) {
        return `20${fixed}`;
      }
    }
    
    // If already has correct format: 20 + 0 + 9 digits = 12 digits total
    // Pattern: 201XXXXXXXXX (20 + 1 + 9 digits)
    if (/^0\d{9}$/.test(after20) && digits.length === 12) {
      return digits; // Already correct: 201XXXXXXXXX
    }
    
    // If has 11 digits after 20, might be 200XXXXXXXXX format (13 digits total)
    if (after20.length === 11 && after20.startsWith('0')) {
      // Check if it's 00XXXXXXXXX (two zeros)
      if (after20.startsWith('00')) {
        // Remove one zero
        const fixed = after20.slice(1);
        if (/^\d{10}$/.test(fixed)) {
          return `20${fixed}`;
        }
      }
    }
  }
  
  // If already starts with 20 and has correct format (201XXXXXXXXX - 10 digits after 20 = 12 total)
  if (/^20\d{10}$/.test(digits) && digits.length === 12) {
    // Check if it starts with 200 (two zeros) and fix it
    if (digits.startsWith('200')) {
      // Remove one zero: 200... -> 20...
      return `20${digits.slice(3)}`;
    }
    return digits;
  }
  
  // Handle 13-digit numbers starting with 200 (two zeros)
  // Example: 2001055200152 -> 201055200152
  if (digits.length === 13 && digits.startsWith('200')) {
    // Remove one zero after 20
    return `20${digits.slice(3)}`;
  }
  
  // Fallback: try to extract valid Egyptian number
  // Look for pattern: 20 followed by digits, fix double zeros
  if (digits.startsWith('20')) {
    const after20 = digits.slice(2);
    // If starts with 00, remove one zero
    if (after20.startsWith('00')) {
      const fixed = after20.slice(1);
      if (/^\d{10}$/.test(fixed)) {
        return `20${fixed}`;
      }
    }
    // If already correct (starts with single 0 and has 10 digits)
    if (/^0\d{9}$/.test(after20)) {
      return digits;
    }
  }
  
  // Final fallback: return sanitized digits
  return digits || r;
}

function normalizeRecipients(recipients) {
  // Normalize array of recipients
  return recipients.map(recipient => normalizeRecipient(recipient));
}

async function sendSms({ recipient, message, senderId = DEFAULT_SENDER_ID, type = 'plain' }) {
  if (!recipient || !message) {
    throw new Error('recipient and message are required');
  }

  const normalizedRecipient = normalizeRecipient(recipient);

  const payload = {
    recipient: normalizedRecipient,
    sender_id: senderId,
    type,
    message,
  };

  const headers = {
    Authorization: `Bearer ${WHY_SMS_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  try {
    const response = await axios.post(WHY_SMS_API_URL, payload, { headers });
    const data = response.data;
    
    // Check if API returned error status (even with 200 HTTP status)
    if (data && data.status === 'error') {
      const errorMessage = data.message || 'SMS API returned an error';
      const err = new Error(errorMessage);
      err.details = data;
      err.isApiError = true;
      throw err;
    }
    
    return data;
  } catch (error) {
    // If it's already our custom error, re-throw it
    if (error.isApiError) {
      throw error;
    }
    
    // Extract detailed error information
    let errorMessage = 'Unknown error';
    let errorDetails = null;
    
    if (error.response) {
      // API responded with error status
      errorDetails = error.response.data;
      if (errorDetails) {
        // Check if response has status: "error"
        if (errorDetails.status === 'error') {
          errorMessage = errorDetails.message || 'SMS API returned an error';
        } else if (typeof errorDetails === 'object') {
          errorMessage = errorDetails.message || errorDetails.error || errorDetails.help || JSON.stringify(errorDetails);
        } else {
          errorMessage = String(errorDetails);
        }
      } else {
        errorMessage = `API Error: ${error.response.status} ${error.response.statusText}`;
      }
    } else if (error.request) {
      // Request was made but no response received
      errorMessage = 'No response from SMS API. Please check your internet connection.';
    } else {
      // Error in request setup
      errorMessage = error.message || 'Unknown error occurred';
    }
    
    const err = new Error(errorMessage);
    err.details = errorDetails || errorMessage;
    err.statusCode = error.response?.status;
    throw err;
  }
}

/**
 * Send SMS to multiple recipients in bulk (faster)
 * @param {Object} options - SMS options
 * @param {string|Array} options.recipients - Single recipient or array of recipients
 * @param {string} options.message - SMS message
 * @param {string} options.senderId - Sender ID (default: ELKABLYTEAM)
 * @param {string} options.type - Message type (default: 'plain')
 * @returns {Promise<Object>} - API response with status and data
 */
async function sendBulkSms({ recipients, message, senderId = DEFAULT_SENDER_ID, type = 'plain' }) {
  if (!recipients || !message) {
    throw new Error('recipients and message are required');
  }

  // Normalize recipients - handle both single and array
  let normalizedRecipients;
  if (Array.isArray(recipients)) {
    normalizedRecipients = normalizeRecipients(recipients);
  } else {
    normalizedRecipients = [normalizeRecipient(recipients)];
  }

  // Join recipients with comma for bulk API
  const recipientString = normalizedRecipients.join(',');

  const payload = {
    recipient: recipientString,
    sender_id: senderId,
    type,
    message,
  };

  const headers = {
    Authorization: `Bearer ${WHY_SMS_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  try {
    const response = await axios.post(WHY_SMS_API_URL, payload, { headers });
    const data = response.data;
    
    // Check if API returned error status (even with 200 HTTP status)
    if (data && data.status === 'error') {
      const errorMessage = data.message || 'SMS API returned an error';
      const err = new Error(errorMessage);
      err.details = data;
      err.isApiError = true;
      throw err;
    }
    
    return data;
  } catch (error) {
    // If it's already our custom error, re-throw it
    if (error.isApiError) {
      throw error;
    }
    
    // Extract detailed error information
    let errorMessage = 'Unknown error';
    let errorDetails = null;
    
    if (error.response) {
      // API responded with error status
      errorDetails = error.response.data;
      if (errorDetails) {
        // Check if response has status: "error"
        if (errorDetails.status === 'error') {
          errorMessage = errorDetails.message || 'SMS API returned an error';
        } else if (typeof errorDetails === 'object') {
          errorMessage = errorDetails.message || errorDetails.error || errorDetails.help || JSON.stringify(errorDetails);
        } else {
          errorMessage = String(errorDetails);
        }
      } else {
        errorMessage = `API Error: ${error.response.status} ${error.response.statusText}`;
      }
    } else if (error.request) {
      // Request was made but no response received
      errorMessage = 'No response from SMS API. Please check your internet connection.';
    } else {
      // Error in request setup
      errorMessage = error.message || 'Unknown error occurred';
    }
    
    const err = new Error(errorMessage);
    err.details = errorDetails || errorMessage;
    err.statusCode = error.response?.status;
    throw err;
  }
}

module.exports = {
  sendSms,
  sendBulkSms,
};

