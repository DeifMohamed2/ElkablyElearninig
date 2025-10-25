const axios = require('axios');
const QRCode = require('qrcode');

/**
 * WasenderAPI - Professional WhatsApp API Service for ElkablyElearning
 * 
 * This utility provides comprehensive WhatsApp messaging capabilities
 * for the ElkablyElearning platform using WasenderAPI.
 * 
 * @author ElkablyElearning
 * @version 1.0.0
 */

// Wasender API configuration
const BASE_URL = 'https://wasenderapi.com/api';
// Access Token for authentication (this is used to access the API)
const ACCESS_TOKEN = process.env.WASENDER_ACCESS_TOKEN || '';
// Session API Key for sending messages (this is the key for the connected WhatsApp number)
const SESSION_API_KEY = process.env.WASENDER_SESSION_API_KEY || '';

class WasenderClient {
  constructor(accessToken = ACCESS_TOKEN) {
    this.accessToken = accessToken;
    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      timeout: 30000,
    });
  }

  // Internal helpers
  static normalizeSession(session) {
    if (!session || typeof session !== 'object') return null;
    
    const id = session.id ?? session.sessionId ?? session.whatsappSession ?? session.whatsapp_session ?? null;
    const name = session.name ?? '';
    const phone_number = session.phone_number ?? session.phoneNumber ?? session.phone ?? null;
    const status = session.status ?? session.state ?? 'DISCONNECTED';
    const api_key = session.api_key ?? session.apiKey ?? null;
    const account_protection = session.account_protection ?? session.accountProtection ?? false;
    const log_messages = session.log_messages ?? session.logMessages ?? false;
    const webhook_url = session.webhook_url ?? session.webhookUrl ?? null;
    const webhook_enabled = session.webhook_enabled ?? session.webhookEnabled ?? false;
    const webhook_events = session.webhook_events ?? session.webhookEvents ?? [];
    const created_at = session.created_at ?? session.createdAt ?? null;
    const updated_at = session.updated_at ?? session.updatedAt ?? null;
    const last_active_at = session.last_active_at ?? session.lastActiveAt ?? null;
    
    return {
      id,
      name,
      phone_number,
      status,
      api_key,
      account_protection,
      log_messages,
      webhook_url,
      webhook_enabled,
      webhook_events,
      created_at,
      updated_at,
      last_active_at,
    };
  }

  // Create a session-specific client for operations that need the session's API key
  createSessionClient(sessionApiKey = SESSION_API_KEY) {
    return axios.create({
      baseURL: BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionApiKey}`,
      },
      timeout: 30000,
    });
  }

  // ==========================================
  // SESSION MANAGEMENT APIs
  // ==========================================

  async createSession(payload = {}) {
    try {
      console.log('Creating session with payload:', payload);
      const r = await this.http.post('/whatsapp-sessions', payload);
      const body = r.data;
      console.log('Session creation response:', body);
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to create session' };
      }
      
      const created = body.data;
      const normalized = WasenderClient.normalizeSession(created) ?? created;
      return { success: true, data: normalized };
    } catch (error) {
      console.error('Wasender API Error:', error.response?.status, error.response?.data);
      if (error.response?.status === 401) {
        return { success: false, message: 'Authentication failed. Please check your access token.' };
      }
      if (error.response?.status === 400) {
        return { success: false, message: 'Invalid request data', error: error.response.data };
      }
      throw error;
    }
  }

  async getAllSessions() {
    try {
      const r = await this.http.get('/whatsapp-sessions');
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to fetch sessions' };
      }
      
      const sessions = Array.isArray(body.data) ? body.data : [];
      const data = sessions.map(WasenderClient.normalizeSession).filter(Boolean);
      return { success: true, data };
    } catch (error) {
      console.error('Wasender API Error:', error.response?.status, error.response?.data);
      if (error.response?.status === 401) {
        return { success: false, message: 'Authentication failed. Please check your access token.' };
      }
      throw error;
    }
  }

  async getSessionDetails(sessionId) {
    try {
      const r = await this.http.get(`/whatsapp-sessions/${sessionId}`);
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to get session details' };
      }
      
      const raw = body.data ?? body;
      const data = WasenderClient.normalizeSession(raw) ?? raw;
      return { success: true, data };
    } catch (error) {
      console.error('Wasender API Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to get session details', error: error.response?.data };
    }
  }

  async connectSession(sessionId) {
    try {
      console.log(`Connecting session: ${sessionId}`);
      const r = await this.http.post(`/whatsapp-sessions/${sessionId}/connect`);
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to connect session' };
      }
      
      return { success: true, data: body.data ?? { id: sessionId, status: 'NEED_SCAN' } };
    } catch (error) {
      console.error('Wasender API Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to connect session', error: error.response?.data };
    }
  }

  async getQRCode(sessionId) {
    try {
      console.log(`Getting QR code for session: ${sessionId}`);
      const r = await this.http.get(`/whatsapp-sessions/${sessionId}/qrcode`);
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to get QR code' };
      }
      
      const qrcode = body.data?.qrCode ?? body.qrCode ?? null;
      return { success: true, data: { qrcode } };
    } catch (error) {
      console.error('Wasender API Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to get QR code', error: error.response?.data };
    }
  }

  async disconnectSession(sessionId) {
    try {
      const r = await this.http.post(`/whatsapp-sessions/${sessionId}/disconnect`);
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to disconnect session' };
      }
      
      return { success: true, data: body.data ?? { id: sessionId, status: 'DISCONNECTED' } };
    } catch (error) {
      console.error('Wasender API Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to disconnect session', error: error.response?.data };
    }
  }

  async deleteSession(sessionId) {
    try {
      const r = await this.http.delete(`/whatsapp-sessions/${sessionId}`);
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to delete session' };
      }
      
      return { success: true, data: body.data ?? { id: sessionId, deleted: true } };
    } catch (error) {
      console.error('Wasender API Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to delete session', error: error.response?.data };
    }
  }

  async updateSession(sessionId, data) {
    try {
      const r = await this.http.put(`/whatsapp-sessions/${sessionId}`, data);
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to update session' };
      }
      
      const raw = body.data ?? body;
      const normalized = WasenderClient.normalizeSession(raw) ?? raw;
      return { success: true, data: normalized };
    } catch (error) {
      console.error('Wasender API Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to update session', error: error.response?.data };
    }
  }

  async getGlobalStatus() {
    try {
      const r = await this.http.get('/status');
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to get global status' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender API Error:', error.response?.status, error.response?.data);
      if (error.response?.status === 401) {
        return { success: false, message: 'Authentication failed. Please check your access token.' };
      }
      throw error;
    }
  }

  // Test authentication
  async testAuth() {
    try {
      const r = await this.http.get('/user');
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Authentication failed' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Auth Test Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Authentication failed', error: error.response?.data };
    }
  }

  // Check if number is on WhatsApp (requires session API key)
  async checkNumberOnWhatsApp(sessionApiKey, jid) {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.get(`/on-whatsapp/${jid}`);
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to check number' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Check Number Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to check number', error: error.response?.data };
    }
  }

  // Regenerate API Key
  async regenerateApiKey(sessionId) {
    try {
      const r = await this.http.post(`/whatsapp-sessions/${sessionId}/regenerate-key`);
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to regenerate key' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Regenerate Key Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to regenerate key', error: error.response?.data };
    }
  }

  // ==========================================
  // MESSAGE APIs
  // ==========================================

  // Send messages (requires session API key)
  async sendTextMessage(sessionApiKey, toJid, text) {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.post('/send-message', { to: toJid, text });
      const body = r.data;
      
      if (!body.success) {
        // Extract detailed error information
        let errorMessage = 'Unknown API error';
        let errorDetails = null;
        
        if (body.error) {
          if (typeof body.error === 'string') {
            errorMessage = body.error;
          } else if (typeof body.error === 'object') {
            // Extract meaningful error information from object
            if (body.error.message) {
              errorMessage = body.error.message;
            } else if (body.error.error) {
              errorMessage = body.error.error;
            } else if (body.error.detail) {
              errorMessage = body.error.detail;
            } else if (body.error.description) {
              errorMessage = body.error.description;
            } else {
              // Try to find any string value in the error object
              const errorValues = Object.values(body.error).filter(val => typeof val === 'string');
              if (errorValues.length > 0) {
                errorMessage = errorValues[0];
              } else {
                errorMessage = 'API returned error object';
                errorDetails = body.error;
              }
            }
          }
        } else if (body.message) {
          errorMessage = body.message;
        }
        
        return { 
          success: false, 
          message: errorMessage,
          error: errorMessage,
          details: body,
          errorDetails: errorDetails
        };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Send Message Error:', error.response?.status, error.response?.data);
      
      // Provide more specific error messages based on HTTP status codes
      let errorMessage = 'Failed to send message';
      let errorDetails = error.response?.data;
      
      if (error.response?.status === 401) {
        errorMessage = 'Unauthorized - Session expired or invalid';
      } else if (error.response?.status === 403) {
        errorMessage = 'Forbidden - Access denied to WhatsApp service';
      } else if (error.response?.status === 404) {
        errorMessage = 'WhatsApp service not found';
      } else if (error.response?.status === 422) {
        errorMessage = 'Validation error - Check phone number format';
      } else if (error.response?.status === 429) {
        errorMessage = 'Rate limit exceeded - Too many requests';
      } else if (error.response?.status === 500) {
        errorMessage = 'WhatsApp service internal error';
      } else if (error.response?.status === 502) {
        errorMessage = 'WhatsApp service temporarily unavailable';
      } else if (error.response?.status === 503) {
        errorMessage = 'WhatsApp service overloaded';
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused - WhatsApp service down';
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = 'WhatsApp service not found';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Connection timeout - WhatsApp service slow';
      }
      
      return { 
        success: false, 
        message: errorMessage, 
        error: errorDetails || error.message,
        status: error.response?.status,
        code: error.code
      };
    }
  }

  async sendImageMessage(sessionApiKey, toJid, imageUrl, text = '') {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.post('/send-message', { to: toJid, imageUrl, text });
      const body = r.data;
      
      if (!body.success) {
        const errorMessage = body.error || body.message || 'Unknown API error';
        return { 
          success: false, 
          message: String(errorMessage),
          error: String(errorMessage)
        };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Send Image Error:', error.response?.status, error.response?.data);
      
      let errorMessage = 'Failed to send image';
      if (error.response?.status === 401) {
        errorMessage = 'Unauthorized - Session expired or invalid';
      } else if (error.response?.status === 429) {
        errorMessage = 'Rate limit exceeded - Too many requests';
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused - WhatsApp service down';
      }
      
      return { 
        success: false, 
        message: errorMessage, 
        error: error.response?.data || error.message 
      };
    }
  }

  async sendVideoMessage(sessionApiKey, toJid, videoUrl, text = '') {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.post('/send-message', { to: toJid, videoUrl, text });
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to send video' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Send Video Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to send video', error: error.response?.data };
    }
  }

  async sendDocumentMessage(sessionApiKey, toJid, documentUrl, fileName) {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.post('/send-message', { to: toJid, documentUrl, fileName });
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to send document' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Send Document Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to send document', error: error.response?.data };
    }
  }

  async sendAudioMessage(sessionApiKey, toJid, audioUrl, text = '') {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.post('/send-message', { to: toJid, audioUrl, text });
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to send audio' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Send Audio Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to send audio', error: error.response?.data };
    }
  }

  async sendStickerMessage(sessionApiKey, toJid, stickerUrl) {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.post('/send-message', { to: toJid, stickerUrl });
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to send sticker' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Send Sticker Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to send sticker', error: error.response?.data };
    }
  }

  async sendContactCard(sessionApiKey, toJid, contactData) {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.post('/send-message', { to: toJid, contact: contactData });
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to send contact' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Send Contact Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to send contact', error: error.response?.data };
    }
  }

  async sendLocation(sessionApiKey, toJid, latitude, longitude, name = '', address = '') {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.post('/send-message', { 
        to: toJid, 
        location: { latitude, longitude, name, address } 
      });
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to send location' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Send Location Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to send location', error: error.response?.data };
    }
  }

  async sendQuotedMessage(sessionApiKey, toJid, text, quotedMessageId) {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.post('/send-message', { 
        to: toJid, 
        text, 
        quotedMessage: { id: quotedMessageId } 
      });
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to send quoted message' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Send Quoted Message Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to send quoted message', error: error.response?.data };
    }
  }

  // Upload Media File
  async uploadMedia(sessionApiKey, file, type = 'image') {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      
      const r = await sessionClient.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to upload media' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Upload Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to upload media', error: error.response?.data };
    }
  }

  // Decrypt Media File
  async decryptMedia(sessionApiKey, mediaData) {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.post('/decrypt-media', mediaData);
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to decrypt media' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Decrypt Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to decrypt media', error: error.response?.data };
    }
  }

  // ==========================================
  // CONTACTS MANAGEMENT
  // ==========================================

  async getAllContacts(sessionApiKey) {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.get('/contacts');
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to get contacts' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Get Contacts Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to get contacts', error: error.response?.data };
    }
  }

  async getContactInfo(sessionApiKey, contactPhone) {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.get(`/contacts/${contactPhone}`);
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to get contact info' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Get Contact Info Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to get contact info', error: error.response?.data };
    }
  }

  async blockContact(sessionApiKey, contactPhone) {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.post(`/contacts/${contactPhone}/block`);
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to block contact' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Block Contact Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to block contact', error: error.response?.data };
    }
  }

  async unblockContact(sessionApiKey, contactPhone) {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.post(`/contacts/${contactPhone}/unblock`);
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to unblock contact' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Unblock Contact Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to unblock contact', error: error.response?.data };
    }
  }

  // ==========================================
  // GROUPS MANAGEMENT
  // ==========================================

  async createGroup(sessionApiKey, name, participants) {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.post('/groups', { name, participants });
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to create group' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Create Group Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to create group', error: error.response?.data };
    }
  }

  async getAllGroups(sessionApiKey) {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.get('/groups');
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to get groups' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Get Groups Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to get groups', error: error.response?.data };
    }
  }

  async sendGroupMessage(sessionApiKey, groupJid, text) {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.post('/send-message', { to: groupJid, text });
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to send group message' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Send Group Message Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to send group message', error: error.response?.data };
    }
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  /**
   * Format phone number for WhatsApp
   * @param {string} phoneNumber - Phone number to format
   * @returns {string} Formatted phone number
   */
  formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // Add country code if not present
    if (cleaned.startsWith('0')) {
      return `+20${cleaned.substring(1)}`; // Assuming Egypt (+20) if starts with 0
    } else if (!cleaned.startsWith('+')) {
      return `+${cleaned}`;
    }
    
    return cleaned;
  }

  /**
   * Validate phone number format
   * @param {string} phoneNumber - Phone number to validate
   * @returns {boolean} Is valid format
   */
  isValidPhoneNumber(phoneNumber) {
    const cleaned = phoneNumber.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  }

  /**
   * Send presence update
   * @param {string} sessionApiKey - Session API key
   * @param {string} toJid - JID to send presence to
   * @param {string} presence - Presence type (typing, recording, etc.)
   * @returns {Promise<Object>} Presence update result
   */
  async sendPresenceUpdate(sessionApiKey, toJid, presence) {
    try {
      const sessionClient = this.createSessionClient(sessionApiKey);
      const r = await sessionClient.post('/send-presence-update', { to: toJid, presence });
      const body = r.data;
      
      if (!body.success) {
        return { success: false, message: body.error || 'Failed to send presence update' };
      }
      
      return { success: true, data: body.data ?? body };
    } catch (error) {
      console.error('Wasender Send Presence Update Error:', error.response?.status, error.response?.data);
      return { success: false, message: 'Failed to send presence update', error: error.response?.data };
    }
  }
}

// Create and export the client instance
const wasender = new WasenderClient();
module.exports = wasender;
