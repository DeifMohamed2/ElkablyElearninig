const wasender = require('../utils/wasender');
const User = require('../models/User');
const Course = require('../models/Course');
const BundleCourse = require('../models/BundleCourse');
const whatsappNotificationService = require('../utils/whatsappNotificationService');
const QRCode = require('qrcode');

// Get WhatsApp management dashboard
const getWhatsAppDashboard = async (req, res) => {
  try {
    // Get WhatsApp session status
    const sessionStatus = await wasender.getGlobalStatus();
    
    // Get all sessions
    const sessionsResult = await wasender.getAllSessions();
    const sessions = sessionsResult.success ? sessionsResult.data : [];
    
    // Get active session
    const activeSession = sessions.find(session => session.status === 'CONNECTED');
    
    // Get statistics
    const stats = {
      totalStudents: await User.countDocuments({ role: 'student', isActive: true }),
      totalCourses: await Course.countDocuments(),
      totalBundles: await BundleCourse.countDocuments()
    };

    res.render('admin/whatsapp-dashboard', {
      title: 'WhatsApp Management | ELKABLY',
      theme: req.cookies.theme || 'light',
      sessionStatus: sessionStatus.success ? sessionStatus.data : null,
      sessions,
      activeSession,
      stats
    });
  } catch (error) {
    console.error('Error loading WhatsApp dashboard:', error);
    req.flash('error_msg', 'Failed to load WhatsApp dashboard');
    res.redirect('/admin/dashboard');
  }
};

// Get WhatsApp session management
const getSessionManagement = async (req, res) => {
  try {
    const sessionsResult = await wasender.getAllSessions();
    const sessions = sessionsResult.success ? sessionsResult.data : [];
    
    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    console.error('Error getting sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sessions'
    });
  }
};

// Create new WhatsApp session
const createSession = async (req, res) => {
  try {
    const { name, phoneNumber } = req.body;
    
    if (!name || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Name and phone number are required'
      });
    }

    const result = await wasender.createSession({
      name,
      phone_number: phoneNumber
    });

    if (result.success) {
      req.flash('success_msg', 'WhatsApp session created successfully');
      res.json({
        success: true,
        message: 'Session created successfully',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create session'
    });
  }
};

// Connect session
const connectSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const result = await wasender.connectSession(sessionId);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Session connection initiated',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('Error connecting session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to connect session'
    });
  }
};

// Get QR code for session
const getQRCode = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log(`Generating QR code for session: ${sessionId}`);
    
    // Step 1: Connect the session first
    const connectResult = await wasender.connectSession(sessionId);
    if (!connectResult.success) {
      console.error('Failed to connect session:', connectResult.message);
      return res.status(500).json({ 
        success: false, 
        message: `Failed to connect session: ${connectResult.message}` 
      });
    }
    
    console.log('Session connected successfully, getting QR code...');
    
    // Step 2: Get the QR code
    const qrResult = await wasender.getQRCode(sessionId);
    if (!qrResult.success) {
      console.error('Failed to get QR code:', qrResult.message);
      return res.status(500).json({ 
        success: false, 
        message: `Failed to get QR code: ${qrResult.message}` 
      });
    }
    
    let qrCodeData = qrResult.data?.qrcode || null;
    if (!qrCodeData) {
      console.error('No QR code data received');
      return res.status(500).json({ 
        success: false, 
        message: 'No QR code data received from API' 
      });
    }
    
    console.log('Raw QR code data received, converting to image...');
    
    // Convert the raw QR code data to a proper image
    // The Wasender API returns raw QR code data that needs to be converted
    try {
      // Generate QR code as data URL
      const qrImageDataUrl = await QRCode.toDataURL(qrCodeData, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 300
      });
      
      console.log('QR code converted to image successfully');
      res.json({
        success: true,
        qrcode: qrImageDataUrl
      });
    } catch (conversionError) {
      console.error('Failed to convert QR code to image:', conversionError.message);
      return res.status(500).json({ 
        success: false, 
        message: `Failed to convert QR code to image: ${conversionError.message}` 
      });
    }
  } catch (error) {
    console.error('Error getting QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get QR code'
    });
  }
};

// Disconnect session
const disconnectSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const result = await wasender.disconnectSession(sessionId);
    
    if (result.success) {
      req.flash('success_msg', 'Session disconnected successfully');
      res.json({
        success: true,
        message: 'Session disconnected successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('Error disconnecting session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect session'
    });
  }
};

// Delete session
const deleteSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const result = await wasender.deleteSession(sessionId);
    
    if (result.success) {
      req.flash('success_msg', 'Session deleted successfully');
      res.json({
        success: true,
        message: 'Session deleted successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete session'
    });
  }
};






// Send bulk message
const sendBulkMessage = async (req, res) => {
  try {
    const { targetType, targetId, customMessage } = req.body;
    
    if (!customMessage || customMessage.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Custom message is required and must be at least 10 characters'
      });
    }
    
    let result;
    
    if (targetType === 'all_students') {
      result = await whatsappNotificationService.sendMessageToAllStudents(customMessage);
    } else if (targetType === 'course' && targetId) {
      result = await whatsappNotificationService.sendMessageToCourseStudents(targetId, customMessage);
    } else if (targetType === 'bundle' && targetId) {
      result = await whatsappNotificationService.sendMessageToBundleStudents(targetId, customMessage);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid target type or missing target ID'
      });
    }

    req.flash('success_msg', 'Bulk message sent successfully');
    res.json({
      success: true,
      message: 'Bulk message sent successfully',
      data: result
    });
  } catch (error) {
    console.error('Error sending bulk message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send bulk message'
    });
  }
};

// Send test message
const sendTestMessage = async (req, res) => {
  try {
    const { studentId, customMessage } = req.body;
    
    if (!studentId || !customMessage) {
      return res.status(400).json({
        success: false,
        message: 'Student ID and custom message are required'
      });
    }

    const result = await whatsappNotificationService.sendToParent(studentId, customMessage);
    
    res.json({
      success: result.success,
      message: result.message
    });
  } catch (error) {
    console.error('Error sending test message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test message'
    });
  }
};

// Get students for messaging
const getStudentsForMessaging = async (req, res) => {
  try {
    const { search, limit = 20 } = req.query;
    
    let query = { role: 'student', isActive: true };
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { studentEmail: { $regex: search, $options: 'i' } },
        { studentCode: { $regex: search, $options: 'i' } }
      ];
    }
    
    const students = await User.find(query)
      .select('firstName lastName studentEmail studentCode parentNumber parentCountryCode')
      .limit(parseInt(limit))
      .sort({ firstName: 1 });
    
    res.json({
      success: true,
      students
    });
  } catch (error) {
    console.error('Error getting students:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get students'
    });
  }
};

// Get courses for messaging
const getCoursesForMessaging = async (req, res) => {
  try {
    const courses = await Course.find({ isActive: true })
      .select('title _id')
      .sort({ title: 1 });
    
    res.json({
      success: true,
      courses
    });
  } catch (error) {
    console.error('Error getting courses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get courses'
    });
  }
};

// Get bundles for messaging
const getBundlesForMessaging = async (req, res) => {
  try {
    const bundles = await BundleCourse.find({ isActive: true })
      .select('title _id')
      .sort({ title: 1 });
    
    res.json({
      success: true,
      bundles
    });
  } catch (error) {
    console.error('Error getting bundles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get bundles'
    });
  }
};

// Get session status
const getSessionStatus = async (req, res) => {
  try {
    // Get all sessions to find the one with our specific API key
    const sessionsResult = await wasender.getAllSessions();
    
    if (!sessionsResult.success) {
      return res.json({
        success: false,
        message: 'Failed to get sessions'
      });
    }
    
    const sessions = sessionsResult.data || [];
    const SESSION_API_KEY = process.env.WASENDER_SESSION_API_KEY || process.env.WHATSAPP_SESSION_API_KEY || '';
    
    // Find session with our specific API key
    const targetSession = sessions.find(session => 
      session.api_key === SESSION_API_KEY || 
      session.apiKey === SESSION_API_KEY ||
      session.whatsapp_api_key === SESSION_API_KEY
    );
    
    if (targetSession) {
      // Map status similar to FromotherSystem implementation
      const mapStatus = (s) => {
        switch (s?.toString().toUpperCase()) {
          case 'CONNECTED':
          case 'AUTHENTICATED':
          case 'READY':
            return 'CONNECTED';
          case 'CONNECTING':
          case 'INITIALIZING':
            return 'CONNECTING';
          case 'NEED_SCAN':
          case 'REQUIRE_QR':
          case 'UNPAIRED':
          case 'UNPAIRED_IDLE':
            return 'NEED_SCAN';
          case 'LOGGED_OUT':
          case 'DISCONNECTED':
            return 'DISCONNECTED';
          default:
            return 'DISCONNECTED';
        }
      };
      
      const mappedStatus = mapStatus(targetSession.status);
      
      res.json({
        success: true,
        session: {
          id: targetSession.id,
          name: targetSession.name || 'WhatsApp Session',
          phone_number: targetSession.phone_number || targetSession.phoneNumber,
          status: mappedStatus,
          last_active_at: targetSession.last_active_at || targetSession.lastActiveAt,
          api_key: targetSession.api_key || targetSession.apiKey,
          account_protection: targetSession.account_protection || targetSession.accountProtection,
          log_messages: targetSession.log_messages || targetSession.logMessages,
          webhook_enabled: targetSession.webhook_enabled || targetSession.webhookEnabled
        }
      });
    } else {
      res.json({
        success: false,
        message: 'No session found with the configured API key'
      });
    }
  } catch (error) {
    console.error('Error getting session status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get session status'
    });
  }
};


// Get session details
const getSessionDetails = async (req, res) => {
  try {
    // Get all sessions to find the one with our specific API key
    const sessionsResult = await wasender.getAllSessions();
    
    if (!sessionsResult.success) {
      return res.json({
        success: false,
        message: 'Failed to get sessions'
      });
    }
    
    const sessions = sessionsResult.data || [];
    const SESSION_API_KEY = process.env.WASENDER_SESSION_API_KEY || process.env.WHATSAPP_SESSION_API_KEY || '';
    
    // Find session with our specific API key
    const targetSession = sessions.find(session => 
      session.api_key === SESSION_API_KEY || 
      session.apiKey === SESSION_API_KEY ||
      session.whatsapp_api_key === SESSION_API_KEY
    );
    
    if (targetSession) {
      // Get detailed session info
      const sessionDetails = await wasender.getSessionDetails(targetSession.id);
      
      if (sessionDetails.success) {
        const details = sessionDetails.data;
        
        // Map status similar to FromotherSystem implementation
        const mapStatus = (s) => {
          switch (s?.toString().toUpperCase()) {
            case 'CONNECTED':
            case 'AUTHENTICATED':
            case 'READY':
              return 'CONNECTED';
            case 'CONNECTING':
            case 'INITIALIZING':
              return 'CONNECTING';
            case 'NEED_SCAN':
            case 'REQUIRE_QR':
            case 'UNPAIRED':
            case 'UNPAIRED_IDLE':
              return 'NEED_SCAN';
            case 'LOGGED_OUT':
            case 'DISCONNECTED':
              return 'DISCONNECTED';
            default:
              return 'DISCONNECTED';
          }
        };
        
        const mappedStatus = mapStatus(details.status || targetSession.status);
        
        res.json({
          success: true,
          session: {
            id: details.id || targetSession.id,
            name: details.name || targetSession.name || 'WhatsApp Session',
            phone_number: details.phone_number || details.phoneNumber || targetSession.phone_number || targetSession.phoneNumber,
            status: mappedStatus,
            last_active_at: details.last_active_at || details.lastActiveAt || targetSession.last_active_at || targetSession.lastActiveAt,
            api_key: details.api_key || details.apiKey || targetSession.api_key || targetSession.apiKey,
            account_protection: details.account_protection || details.accountProtection || targetSession.account_protection || targetSession.accountProtection,
            log_messages: details.log_messages || details.logMessages || targetSession.log_messages || targetSession.logMessages,
            webhook_enabled: details.webhook_enabled || details.webhookEnabled || targetSession.webhook_enabled || targetSession.webhookEnabled,
            webhook_url: details.webhook_url || details.webhookUrl || targetSession.webhook_url || targetSession.webhookUrl,
            webhook_events: details.webhook_events || details.webhookEvents || targetSession.webhook_events || targetSession.webhookEvents,
            created_at: details.created_at || details.createdAt || targetSession.created_at || targetSession.createdAt,
            updated_at: details.updated_at || details.updatedAt || targetSession.updated_at || targetSession.updatedAt
          }
        });
      } else {
        // Fallback to basic session info
        const mapStatus = (s) => {
          switch (s?.toString().toUpperCase()) {
            case 'CONNECTED':
            case 'AUTHENTICATED':
            case 'READY':
              return 'CONNECTED';
            case 'CONNECTING':
            case 'INITIALIZING':
              return 'CONNECTING';
            case 'NEED_SCAN':
            case 'REQUIRE_QR':
            case 'UNPAIRED':
            case 'UNPAIRED_IDLE':
              return 'NEED_SCAN';
            case 'LOGGED_OUT':
            case 'DISCONNECTED':
              return 'DISCONNECTED';
            default:
              return 'DISCONNECTED';
          }
        };
        
        const mappedStatus = mapStatus(targetSession.status);
        
        res.json({
          success: true,
          session: {
            id: targetSession.id,
            name: targetSession.name || 'WhatsApp Session',
            phone_number: targetSession.phone_number || targetSession.phoneNumber,
            status: mappedStatus,
            last_active_at: targetSession.last_active_at || targetSession.lastActiveAt,
            api_key: targetSession.api_key || targetSession.apiKey,
            account_protection: targetSession.account_protection || targetSession.accountProtection,
            log_messages: targetSession.log_messages || targetSession.logMessages,
            webhook_enabled: targetSession.webhook_enabled || targetSession.webhookEnabled
          }
        });
      }
    } else {
      res.json({
        success: false,
        message: 'No session found with the configured API key'
      });
    }
  } catch (error) {
    console.error('Error getting session details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get session details'
    });
  }
};


module.exports = {
  getWhatsAppDashboard,
  getSessionManagement,
  createSession,
  connectSession,
  getQRCode,
  disconnectSession,
  deleteSession,
  sendBulkMessage,
  sendTestMessage,
  getStudentsForMessaging,
  getCoursesForMessaging,
  getBundlesForMessaging,
  getSessionStatus,
  getSessionDetails,
  
};
