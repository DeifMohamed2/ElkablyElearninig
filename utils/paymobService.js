// utils/paymobService.js - Paymob Payment Gateway Integration
const axios = require('axios');
const crypto = require('crypto');

class PaymobService {
  constructor() {
    this.baseUrl = process.env.PAYMOB_BASE_URL || 'https://accept.paymob.com';
    this.apiKey = process.env.PAYMOB_API_KEY;
    this.iframeId = process.env.PAYMOB_IFRAME_ID;
    this.integrationIdCard = process.env.PAYMOB_INTEGRATION_ID_CARD;
    this.integrationIdWallet = process.env.PAYMOB_INTEGRATION_ID_WALLET;
    this.webhookSecret = process.env.PAYMOB_WEBHOOK_SECRET;


    // Validate required environment variables
    if (!this.apiKey) {
      console.warn('⚠️ PAYMOB_API_KEY is not set in environment variables');
    }
    if (!this.iframeId) {
      console.warn('⚠️ PAYMOB_IFRAME_ID is not set in environment variables');
    }
  }

  /**
   * Get authentication token from Paymob with retry logic
   */
  async getAuthToken() {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const url = `${this.baseUrl}/api/auth/tokens`;
        console.log(
          `Requesting auth token from: ${url} (Attempt ${attempt}/${maxRetries})`
        );
        console.log(
          'API Key for request:',
          this.apiKey ? this.apiKey.substring(0, 20) + '...' : 'undefined'
        );

        const response = await axios.post(
          url,
          { api_key: this.apiKey },
          {
            timeout: 15000, // 15 second timeout
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'ElkablyElearning/1.0',
            },
          }
        );

        console.log('Auth token received successfully');
        return response.data.token;
      } catch (error) {
        console.error(
          `Error getting Paymob auth token (Attempt ${attempt}/${maxRetries}):`,
          error.code || error.message
        );

        // Log detailed error information
        console.error('Full error details:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          code: error.code,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            timeout: error.config?.timeout,
            data: error.config?.data
              ? 'Request data present'
              : 'No request data',
          },
        });

        // If this is the last attempt, throw the error
        if (attempt === maxRetries) {
          // Check if it's a network timeout or connection error
          if (
            error.code === 'ETIMEDOUT' ||
            error.code === 'ECONNABORTED' ||
            error.code === 'ECONNRESET'
          ) {
            throw new Error(
              `Connection timeout to Paymob after ${maxRetries} attempts. Please check your internet connection and try again.`
            );
          } else if (error.response?.status === 401) {
            throw new Error(
              'Invalid Paymob API key. Please check your configuration.'
            );
          } else if (error.response?.status >= 500) {
            throw new Error('Paymob server error. Please try again later.');
          } else {
            throw new Error(
              'Failed to authenticate with Paymob. Please try again.'
            );
          }
        }

        // Wait before retrying (exponential backoff)
        const delay = retryDelay * Math.pow(2, attempt - 1);
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Create order in Paymob with retry logic
   */
  async createOrder(
    authToken,
    amountCents,
    merchantOrderId = null,
    items = []
  ) {
    const maxRetries = 3;
    const retryDelay = 1500;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const url = `${this.baseUrl}/api/ecommerce/orders`;
        const body = {
          auth_token: authToken,
          delivery_needed: 'false',
          amount_cents: amountCents,
          currency: 'EGP',
          items: items.map((item) => ({
            name: item.title || item.name,
            amount_cents: Math.round(item.price * 100),
            description: item.description || '',
            quantity: item.quantity || 1,
          })),
        };

        if (merchantOrderId) {
          body.merchant_order_id = merchantOrderId;
        }

        const response = await axios.post(url, body, {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'ElkablyElearning/1.0',
          },
        });

        console.log('Order created successfully:', response.data.id);
        return response.data.id;
      } catch (error) {
        console.error(
          `Error creating Paymob order (Attempt ${attempt}/${maxRetries}):`,
          error.code || error.message
        );

        if (attempt === maxRetries) {
          if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            throw new Error(
              'Connection timeout while creating order. Please try again.'
            );
          }
          throw new Error('Failed to create payment order');
        }

        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Generate payment key for iframe with retry logic
   */
  async generatePaymentKey(
    authToken,
    orderId,
    amountCents,
    billingData = {},
    integrationId
  ) {
    const maxRetries = 3;
    const retryDelay = 1500;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const url = `${this.baseUrl}/api/acceptance/payment_keys`;
        const body = {
          auth_token: authToken,
          amount_cents: amountCents,
          expiration: 3600,
          order_id: orderId,
          billing_data: {
            apartment: billingData.apartment || 'NA',
            email: billingData.email || 'customer@example.com',
            floor: billingData.floor || 'NA',
            first_name: billingData.firstName || 'Customer',
            street: billingData.address || 'NA',
            building: billingData.building || 'NA',
            phone_number: billingData.phone || '+201000000000',
            shipping_method: 'NA',
            postal_code: billingData.zipCode || 'NA',
            city: billingData.city || 'Cairo',
            country: billingData.country || 'EG',
            last_name: billingData.lastName || 'Lastname',
            state: billingData.state || 'NA',
          },
          currency: 'EGP',
          integration_id: Number(integrationId),
          // Add redirect URLs for iframe
          redirection_url:
            billingData.redirectUrl ||
            `${
              process.env.BASE_DOMAIN || 'http://localhost:3000'
            }/purchase/payment/success`,
        };

        const response = await axios.post(url, body, {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'ElkablyElearning/1.0',
          },
        });

        console.log('Payment key generated successfully');
        return response.data.token;
      } catch (error) {
        console.error(
          `Error generating payment key (Attempt ${attempt}/${maxRetries}):`,
          error.code || error.message
        );

        if (attempt === maxRetries) {
          if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            throw new Error(
              'Connection timeout while generating payment key. Please try again.'
            );
          }
          throw new Error('Failed to generate payment key');
        }

        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Create complete payment session (order + payment key)
   */
  async createPaymentSession(orderData, billingData, paymentMethod = 'card') {
    try {
      const authToken = await this.getAuthToken();

      // Convert amount to cents (Paymob uses cents)
      const amountCents = Math.round(orderData.total * 100);

      // Create order
      const orderId = await this.createOrder(
        authToken,
        amountCents,
        orderData.merchantOrderId,
        orderData.items
      );

      // Determine integration ID based on payment method
      const integrationId =
        paymentMethod === 'wallet'
          ? this.integrationIdWallet
          : this.integrationIdCard;

      // Generate payment key
      const paymentToken = await this.generatePaymentKey(
        authToken,
        orderId,
        amountCents,
        billingData,
        integrationId
      );

      // Create iframe URL
      const iframeUrl = `${this.baseUrl}/api/acceptance/iframes/${this.iframeId}?payment_token=${paymentToken}`;

      return {
        success: true,
        orderId,
        paymentToken,
        iframeUrl,
        merchantOrderId: orderData.merchantOrderId,
        amountCents,
      };
    } catch (error) {
      console.error('Error creating payment session:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(rawBody, signature) {
    if (!signature || !this.webhookSecret) {
      return false;
    }

    const computed = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    let incoming = String(signature).trim();
    if (incoming.startsWith('sha256=')) {
      incoming = incoming.split('=')[1];
    }

    try {
      return crypto.timingSafeEqual(
        Buffer.from(computed),
        Buffer.from(incoming)
      );
    } catch (error) {
      console.error('Error verifying webhook signature:', error.message);
      return false;
    }
  }

  /**
   * Process webhook payload and determine payment status
   * Enhanced to match Paymob standalone app comprehensive failure detection
   */
  processWebhookPayload(payload, queryParams = {}) {
    // Normalize candidate status fields from Paymob payloads (from both payload and query)
    const statusCandidates = [
      payload?.obj?.transaction_status,
      payload?.transaction_status,
      payload?.obj?.status,
      payload?.status,
      payload?.obj?.is_success,
      payload?.is_success,
      payload?.obj?.success,
      payload?.success,
      payload?.obj?.response_code,
      payload?.response_code,
      // Also check query parameters (for redirect callbacks)
      queryParams?.success,
      queryParams?.is_success,
      queryParams?.pending,
      queryParams?.error_occured,
      queryParams?.['data.message'],
      queryParams?.acq_response_code,
      queryParams?.txn_response_code,
    ];

    // Comprehensive success detection (must be explicitly successful)
    const explicitSuccess =
      payload?.obj?.success === true ||
      payload?.success === true ||
      payload?.obj?.is_success === true ||
      payload?.is_success === true ||
      String(payload?.obj?.transaction_status).toUpperCase() === 'CAPTURED' ||
      String(payload?.transaction_status).toUpperCase() === 'CAPTURED' ||
      // Query-based success checks (for redirect callbacks)
      (queryParams?.success === 'true' &&
        queryParams?.pending === 'false' &&
        queryParams?.error_occured !== 'true' &&
        (queryParams?.['data.message'] === 'Approved' ||
          queryParams?.acq_response_code === '00' ||
          queryParams?.txn_response_code === 'APPROVED' ||
          queryParams?.is_capture === 'true' ||
          queryParams?.is_auth === 'true'));

    // Comprehensive failure indicators (expanded to match standalone app)
    const failedIndicators = [
      'DECLINED',
      'FAILED',
      'CHARGEBACK',
      'CANCELLED',
      'VOID',
      'AUTHENTICATION_FAILED',
      'DO_NOT_PROCEED',
      'REJECTED',
      'TIMEOUT',
      'EXPIRED',
      'INSUFFICIENT_FUNDS',
      'INVALID_CARD',
      'BLOCKED',
      'FRAUD_SUSPECTED',
      'CARD_EXPIRED',
      'INVALID_CVV',
      'LIMIT_EXCEEDED',
      'PICKUP_CARD',
      'RESTRICTED_CARD',
      'SECURITY_VIOLATION',
    ];

    // Check for explicit failure in various fields
    const explicitFailure =
      payload?.obj?.success === false ||
      payload?.success === false ||
      payload?.obj?.is_success === false ||
      payload?.is_success === false ||
      payload?.obj?.error_occured === true ||
      payload?.error_occured === true ||
      // Query-based failure checks
      queryParams?.success === 'false' ||
      queryParams?.error_occured === 'true';

    // Check for failure in status fields
    const statusFailure = statusCandidates.some(
      (status) =>
        status && failedIndicators.includes(String(status).toUpperCase())
    );

    // Check for failure in data.message field (common in Paymob)
    const messageFailure =
      (payload?.obj?.data?.message &&
        failedIndicators.includes(
          String(payload.obj.data.message).toUpperCase()
        )) ||
      (queryParams?.['data.message'] &&
        failedIndicators.includes(
          String(queryParams['data.message']).toUpperCase()
        ));

    // Check for failure in data.acq_response_code field
    const responseCodeFailure =
      (payload?.obj?.data?.acq_response_code &&
        failedIndicators.includes(
          String(payload.obj.data.acq_response_code).toUpperCase()
        )) ||
      (queryParams?.acq_response_code &&
        failedIndicators.includes(
          String(queryParams.acq_response_code).toUpperCase()
        ));

    // Check for zero paid amount (indication of failure)
    const zeroPaidAmount =
      (payload?.obj?.order?.paid_amount_cents === 0 ||
        payload?.order?.paid_amount_cents === 0) &&
      (payload?.obj?.amount_cents > 0 || payload?.amount_cents > 0);

    // Check for specific response codes that indicate failure
    const failureResponseCodes = [
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '12',
      '13',
      '14',
      '15',
      '17',
      '20',
      '30',
    ];
    const responseCodeIndicatesFailure =
      failureResponseCodes.includes(String(payload?.obj?.response_code)) ||
      failureResponseCodes.includes(String(payload?.response_code)) ||
      failureResponseCodes.includes(String(queryParams?.response_code));

    // Check for payment status indicators
    const paymentStatusFailure =
      String(payload?.obj?.order?.payment_status).toUpperCase() === 'UNPAID' ||
      String(payload?.order?.payment_status).toUpperCase() === 'UNPAID' ||
      String(payload?.obj?.order?.payment_status).toUpperCase() === 'FAILED' ||
      String(payload?.order?.payment_status).toUpperCase() === 'FAILED';

    // Determine final status
    const isFailed =
      explicitFailure ||
      statusFailure ||
      messageFailure ||
      responseCodeFailure ||
      zeroPaidAmount ||
      responseCodeIndicatesFailure ||
      paymentStatusFailure;

    const isSuccess = explicitSuccess && !isFailed; // Success only if explicitly successful AND not failed

    console.log('Payment Status Analysis (Enhanced):', {
      explicitSuccess,
      explicitFailure,
      statusFailure,
      messageFailure,
      responseCodeFailure,
      zeroPaidAmount,
      responseCodeIndicatesFailure,
      paymentStatusFailure,
      finalIsSuccess: isSuccess,
      finalIsFailed: isFailed,
      statusCandidates: statusCandidates.filter(Boolean),
      successField: payload?.obj?.success || payload?.success,
      messageField:
        payload?.obj?.data?.message || queryParams?.['data.message'],
      responseCodeField:
        payload?.obj?.data?.acq_response_code || queryParams?.acq_response_code,
      paidAmount:
        payload?.obj?.order?.paid_amount_cents ||
        payload?.order?.paid_amount_cents,
      paymentStatus:
        payload?.obj?.order?.payment_status || payload?.order?.payment_status,
    });

    return {
      merchantOrderId:
        payload?.obj?.order?.merchant_order_id ||
        payload?.obj?.merchant_order_id ||
        payload?.merchant_order_id ||
        queryParams?.merchant_order_id,
      transactionId: payload?.obj?.id || payload?.id || queryParams?.id,
      isSuccess,
      isFailed,
      isPending: !isSuccess && !isFailed,
      amount: payload?.obj?.amount_cents || payload?.amount_cents,
      currency: payload?.obj?.currency || payload?.currency,
      rawPayload: payload,
      queryParams,
    };
  }

  /**
   * Get user-friendly error message
   * Enhanced with comprehensive error mapping from Paymob standalone app
   */
  getFriendlyError(error) {
    // Extended error map for card decline / response codes (from standalone app)
    const errorMap = {
      // success
      0: 'Transaction approved',
      0: 'Transaction approved',

      // common decline / response codes
      1: 'Refer to issuer – card problem, try alternate method or contact bank.',
      1: 'Refer to issuer – card problem, try alternate method or contact bank.',
      2: 'Refer to issuer (special) – card issue, contact bank.',
      2: 'Refer to issuer (special) – card issue, contact bank.',
      3: 'Invalid merchant or service provider – check your Paymob account setup.',
      3: 'Invalid merchant or service provider – check your Paymob account setup.',
      4: 'Pickup card – card declined by bank.',
      4: 'Pickup card – card declined by bank.',
      5: 'Do not honour – bank declined transaction.',
      5: 'Do not honour – bank declined transaction.',
      6: 'Error – card declined.',
      6: 'Error – card declined.',
      7: 'Pickup card (special) – card flagged.',
      7: 'Pickup card (special) – card flagged.',
      8: 'Honour with identification – approval but extra ID required.',
      8: 'Honour with identification – approval but extra ID required.',
      9: 'Request in progress – awaiting response.',
      9: 'Request in progress – awaiting response.',
      10: 'Approved for partial amount – only part of amount processed.',
      10: 'Approved for partial amount – only part of amount processed.',
      12: 'Invalid transaction – check card details and try again.',
      12: 'Invalid transaction – check card details and try again.',
      13: 'Invalid amount – check the amount format or currency.',
      13: 'Invalid amount – check the amount format or currency.',
      14: 'Invalid card number – card number is incorrect.',
      14: 'Invalid card number – card number is incorrect.',
      15: "No issuer – card's bank not found.",
      15: "No issuer – card's bank not found.",
      17: 'Customer cancellation – customer cancelled the transaction.',
      17: 'Customer cancellation – customer cancelled the transaction.',
      18: 'Customer dispute – card issuer blocked transaction.',
      18: 'Customer dispute – card issuer blocked transaction.',
      19: 'Re-enter last transaction – try again.',
      19: 'Re-enter last transaction – try again.',
      20: 'Invalid response/acquirer error – processing error.',
      20: 'Invalid response/acquirer error – processing error.',
      21: 'No action taken – bank did not act.',
      21: 'No action taken – bank did not act.',
      22: 'Suspected malfunction – issue contacting bank.',
      22: 'Suspected malfunction – issue contacting bank.',
      23: "Unacceptable transaction – bank doesn't allow this type.",
      23: "Unacceptable transaction – bank doesn't allow this type.",
      24: 'File update impossible – bank system issue.',
      24: 'File update impossible – bank system issue.',
      25: "Unable to locate record – bank didn't find transaction.",
      25: "Unable to locate record – bank didn't find transaction.",
      26: 'Duplicate reference number – same transaction attempted again.',
      26: 'Duplicate reference number – same transaction attempted again.',
      27: 'Error in reference number – bad transaction reference.',
      27: 'Error in reference number – bad transaction reference.',
      28: 'File temporarily unavailable – try later.',
      28: 'File temporarily unavailable – try later.',
      29: 'File action failed / contact acquirer – bank internal error.',
      29: 'File action failed / contact acquirer – bank internal error.',
      30: 'Format error – data format error in request.',
      30: 'Format error – data format error in request.',

      // Textual error codes
      INVALID_CARD: 'Invalid card details. Please check and try again.',
      INSUFFICIENT_FUNDS: 'Payment declined: insufficient funds.',
      FRAUD_SUSPECTED: 'Payment blocked for security reasons. Contact support.',
      AUTHENTICATION_FAILED:
        'Card authentication failed. Please try again or use a different card.',
      DO_NOT_PROCEED:
        'Transaction declined by bank. Please try a different payment method.',
      DECLINED:
        'Payment declined by your bank. Please contact your bank or try a different card.',
      FAILED: 'Payment failed. Please try again.',
      CANCELLED: 'Payment was cancelled.',
      VOID: 'Transaction was voided.',
      CHARGEBACK: 'Payment disputed.',
      REJECTED: 'Payment rejected by bank.',
      TIMEOUT: 'Payment timed out. Please try again.',
      EXPIRED: 'Payment session expired. Please try again.',
      BLOCKED: 'Card is blocked. Please contact your bank.',
      CARD_EXPIRED: 'Card has expired. Please use a different card.',
      INVALID_CVV: 'Invalid CVV code. Please check and try again.',
      LIMIT_EXCEEDED: 'Transaction limit exceeded. Please contact your bank.',
      PICKUP_CARD: 'Card declined. Please contact your bank.',
      RESTRICTED_CARD: 'Card is restricted. Please use a different card.',
      SECURITY_VIOLATION: 'Security check failed. Please contact support.',
    };

    const remote = error?.response?.data || {};

    // Helper to coerce found value to a string key
    const asKey = (v) => (v === null || v === undefined ? null : String(v));

    let code = null;

    // Common candidate fields where gateways put response codes (enhanced list)
    const candidates = [
      remote.error_code,
      remote.code,
      remote.response_code,
      remote.transaction_status,
      remote.status,
      remote.result,
      remote.status_code,
      remote.transaction_response && remote.transaction_response.code,
      remote.obj && remote.obj.transaction_status,
      remote.obj && remote.obj.response_code,
      remote.obj && remote.obj.data && remote.obj.data.message,
      remote.obj && remote.obj.data && remote.obj.data.acq_response_code,
      // sometimes nested under data or result
      remote.data && remote.data.response_code,
      remote.data && remote.data.code,
      remote.data && remote.data.message,
      remote.data && remote.data.acq_response_code,
    ];

    for (const c of candidates) {
      if (c !== undefined && c !== null) {
        code = asKey(c);
        break;
      }
    }

    // Some gateways return codes inside strings like "response: 5" — try to find a numeric token
    if (!code && remote.message && typeof remote.message === 'string') {
      const m =
        remote.message.match(/(?:code[:=\s]*)(\d+)/i) ||
        remote.message.match(/\b(\d{1,3})\b/);
      if (m) code = m[1];
    }

    if (code && errorMap[code]) {
      return errorMap[code];
    }

    // If remote contains a human-friendly message, prefer it
    if (remote.message && typeof remote.message === 'string') {
      return remote.message;
    }

    // Some responses include 'errors' array or object with details
    if (remote.errors) {
      if (Array.isArray(remote.errors) && remote.errors.length) {
        return String(remote.errors[0]);
      }
      if (typeof remote.errors === 'string') {
        return remote.errors;
      }
      if (typeof remote.errors === 'object') {
        return JSON.stringify(remote.errors);
      }
    }

    // Final fallback
    return error.message || 'Payment error — please try again later.';
  }

  /**
   * Query transaction status by merchant order ID with retry logic
   */
  async queryTransactionStatus(merchantOrderId) {
    const maxRetries = 3;
    const retryDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const authToken = await this.getAuthToken();
        const url = `${this.baseUrl}/api/ecommerce/orders/transaction_inquiry`;

        const response = await axios.post(
          url,
          {
            auth_token: authToken,
            merchant_order_id: merchantOrderId,
          },
          {
            timeout: 10000,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'ElkablyElearning/1.0',
            },
          }
        );

        console.log('Transaction status queried successfully');
        return response.data;
      } catch (error) {
        console.error(
          `Error querying transaction status (Attempt ${attempt}/${maxRetries}):`,
          error.code || error.message
        );

        if (attempt === maxRetries) {
          if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            throw new Error(
              'Connection timeout while checking payment status. Please contact support if your payment was successful.'
            );
          } else if (error.response?.status === 401) {
            throw new Error(
              'Authentication failed while checking payment status.'
            );
          } else if (error.response?.status >= 500) {
            throw new Error(
              'Payment gateway server error. Please contact support.'
            );
          } else {
            throw new Error(
              'Failed to verify payment status. Please contact support if you believe the payment was successful.'
            );
          }
        }

        const delay = retryDelay * Math.pow(1.5, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}

module.exports = new PaymobService();
