const wasender = require('./wasender');
const { sendSms } = require('./sms');
const User = require('../models/User');
const Course = require('../models/Course');
const BundleCourse = require('../models/BundleCourse');
const cloudinary = require('./cloudinary');

class WhatsAppSMSNotificationService {
  constructor() {
    this.sessionApiKey = process.env.WASENDER_SESSION_API_KEY || process.env.WHATSAPP_SESSION_API_KEY || '';
    this.whatsappLink = 'https://wa.me/201050994880';
  }

  /**
   * Check if a phone number is Egyptian (+20 or 20 or starts with 0 in Egypt format)
   */
  isEgyptianNumber(phoneNumber, countryCode) {
    if (!phoneNumber) return false;
    
    // Check country code first (most reliable)
    if (countryCode === '+20' || countryCode === '20') {
      return true;
    }
    
    // Check phone number format
    const cleaned = String(phoneNumber).replace(/\D/g, '');
    
    // Egyptian numbers: starts with 20 followed by 10 digits, or starts with 0 followed by 10 digits
    if (/^20\d{10}$/.test(cleaned)) {
      return true;
    }
    
    // Local Egyptian format: starts with 0 followed by 10 digits
    if (/^0\d{10}$/.test(cleaned)) {
      return true;
    }
    
    // Check if formatted number starts with +20
    const formatted = String(phoneNumber).replace(/^\++/, '');
    if (formatted.startsWith('20') && /^20\d{10,11}$/.test(formatted.replace(/\D/g, ''))) {
      return true;
    }
    
    return false;
  }

  /**
   * Ensure SMS message includes WhatsApp link and is within 160 characters
   * Appends WhatsApp link while preserving total length within limit
   */
  truncateSmsMessage(message, maxLength = 160) {
    if (!message) return '';
    
    // Reserve space for WhatsApp link (27 chars) plus separator
    const linkWithSeparator = `\n${this.whatsappLink}`;
    const linkLength = linkWithSeparator.length; // 28 chars (27 + newline)
    const availableLength = maxLength - linkLength; // 132 chars for message
    
    // Truncate message if needed to fit within available length
    let finalMessage = message;
    if (message.length > availableLength) {
      finalMessage = message.substring(0, availableLength - 3) + '...';
    }
    
    // Append WhatsApp link (only if not already present)
    if (!finalMessage.includes(this.whatsappLink)) {
      return finalMessage + linkWithSeparator;
    }
    
    // If link already exists, ensure total length is within limit
    if (finalMessage.length > maxLength) {
      return finalMessage.substring(0, maxLength - 3) + '...';
    }
    
    return finalMessage;
  }

  /**
   * Ensure any SMS message includes WhatsApp link and stays within 160 characters
   * This method is used for messages that might not go through truncateSmsMessage
   */
  ensureSmsMessageWithLink(message, maxLength = 160) {
    if (!message) return '';
    
    // Check if link is already present
    if (message.includes(this.whatsappLink)) {
      // Link already exists, just ensure length is within limit
      if (message.length <= maxLength) return message;
      return message.substring(0, maxLength - 3) + '...';
    }
    
    // Append link and ensure total length is within limit
    const linkWithSeparator = `\n${this.whatsappLink}`;
    const linkLength = linkWithSeparator.length;
    const availableLength = maxLength - linkLength;
    
    let finalMessage = message;
    if (message.length > availableLength) {
      finalMessage = message.substring(0, availableLength - 3) + '...';
    }
    
    return finalMessage + linkWithSeparator;
  }

  /**
   * Remove WhatsApp link from message (for WhatsApp messages only)
   * SMS messages should keep the link
   */
  removeWhatsAppLink(message) {
    if (!message) return '';
    
    // Remove the WhatsApp link and any trailing/leading whitespace or newlines
    let cleanedMessage = message.replace(this.whatsappLink, '').trim();
    
    // Remove any double newlines that might be left after removing the link
    cleanedMessage = cleanedMessage.replace(/\n\n+/g, '\n');
    
    return cleanedMessage;
  }

  /**
   * Generate SMS message for quiz completion (140-160 chars) - Vertical format
   */
  getSmsQuizCompletionMessage(student, quizData, score, totalQuestions, percentage) {
    const grade = `${score}/${totalQuestions}`;
    const quizTitle = (quizData.title || 'Quiz').substring(0, 30);
    const studentName = (student.firstName || '').substring(0, 20);
    
    let message;
    if (percentage >= 90) {
      message = `Quiz Update\n${studentName} completed: "${quizTitle}"\nScore: ${grade} (${percentage}%)\nOutstanding! Keep it up!\nELKABLY`;
    } else if (percentage >= 70) {
      message = `Quiz Update\n${studentName} completed: "${quizTitle}"\nScore: ${grade} (${percentage}%)\nGood job! Great progress!\nELKABLY`;
    } else if (percentage >= 50) {
      message = `Quiz Update\n${studentName} completed: "${quizTitle}"\nScore: ${grade} (${percentage}%)\nKeep encouraging them!\nELKABLY`;
    } else {
      message = `Quiz Update\n${studentName} completed: "${quizTitle}"\nScore: ${grade} (${percentage}%)\nMore practice needed.\nPlease support!\nELKABLY`;
    }
    
    return this.truncateSmsMessage(message);
  }

  /**
   * Generate SMS message for content completion (140-160 chars) - Vertical format
   */
  getSmsContentCompletionMessage(student, contentData, courseData) {
    const studentName = (student.firstName || '').substring(0, 20);
    const contentTitle = (contentData.title || 'Content').substring(0, 35);
    const weekTitle = (courseData.title || 'Week').substring(0, 25);
    const message = `Progress Update\n${studentName} completed: "${contentTitle}"\nIn: ${weekTitle}\nExcellent progress!\nELKABLY`;
    return this.truncateSmsMessage(message);
  }

  /**
   * Generate SMS message for topic completion (140-160 chars) - Vertical format
   */
  getSmsTopicCompletionMessage(student, topicData, courseData) {
    const studentName = (student.firstName || '').substring(0, 20);
    const topicTitle = (topicData.title || 'Topic').substring(0, 35);
    const weekTitle = (courseData.title || 'Week').substring(0, 25);
    const message = `Progress Update\n${studentName} completed: "${topicTitle}"\nIn: ${weekTitle}\nExcellent work!\nKeep encouraging!\nELKABLY`;
    return this.truncateSmsMessage(message);
  }

  /**
   * Generate SMS message for course completion (140-160 chars) - Vertical format
   */
  getSmsCourseCompletionMessage(student, courseData) {
    const studentName = (student.firstName || '').substring(0, 20);
    const weekTitle = (courseData.title || 'Week').substring(0, 30);
    const message = `Congratulations!\n${studentName} completed: "${weekTitle}"\nExcellent work!\nWe are proud!\nELKABLY`;
    return this.truncateSmsMessage(message);
  }

  /**
   * Generate SMS message for purchase notification (140-160 chars) - Vertical format
   */
  getSmsPurchaseMessage(student, purchaseData) {
    const studentName = (student.firstName || '').substring(0, 20);
    const orderNum = (purchaseData.orderNumber || purchaseData._id.toString()).substring(0, 12);
    const total = purchaseData.total || 0;
    // Count both cart items and books
    const cartItems = purchaseData.items ? purchaseData.items.length : 0;
    const bookItems = purchaseData.bookOrders ? purchaseData.bookOrders.length : 0;
    const totalItems = cartItems + bookItems;
    const message = `Payment Confirmed!\nStudent: ${studentName}\nOrder: #${orderNum}\nItems: ${totalItems} item(s)\nTotal: EGP ${total}\nThank you!\nELKABLY`;
    return this.truncateSmsMessage(message);
  }

  /**
   * Generate SMS welcome message for student (140-160 chars) - Vertical format
   */
  getSmsWelcomeMessageStudent(student) {
    const studentName = (student.firstName || '').substring(0, 20);
    const code = (student.studentCode || '').substring(0, 15);
    const schoolName = (student.schoolName || '').substring(0, 18);
    const grade = student.grade || '';
    let message = `Welcome to ELKABLY!\nDear ${studentName}\nCode: ${code}`;
    if (schoolName) message += `\nSchool: ${schoolName}`;
    if (grade) message += `\nGrade: ${grade}`;
    message += `\nYour learning journey starts now!\nELKABLY`;
    return this.truncateSmsMessage(message);
  }

  /**
   * Generate SMS welcome message for parent (140-160 chars) - Vertical format
   */
  getSmsWelcomeMessageParent(student) {
    const studentName = (student.firstName || '').substring(0, 20);
    const code = (student.studentCode || '').substring(0, 15);
    const schoolName = (student.schoolName || '').substring(0, 18);
    const grade = student.grade || '';
    let message = `Welcome to ELKABLY!\nStudent: ${studentName}\nCode: ${code}`;
    if (schoolName) message += `\nSchool: ${schoolName}`;
    if (grade) message += `\nGrade: ${grade}`;
    message += `\nLearning journey starts now!\nELKABLY`;
    return this.truncateSmsMessage(message);
  }

  /**
   * Generate SMS message for course enrollment (140-160 chars) - Vertical format
   */
  getSmsCourseEnrollmentMessage(student, courseData) {
    const studentName = (student.firstName || '').substring(0, 20);
    const weekTitle = (courseData.title || 'Week').substring(0, 35);
    const subject = (courseData.subject || '').substring(0, 18);
    let message = `Enrollment Confirmed!\nStudent: ${studentName}\nCourse: ${weekTitle}`;
    if (subject) message += `\nSubject: ${subject}`;
    message += `\nReady to learn!\nAccess materials now!\nELKABLY`;
    return this.truncateSmsMessage(message);
  }

  /**
   * Generate SMS message for bundle enrollment (140-160 chars) - Vertical format
   */
  getSmsBundleEnrollmentMessage(student, bundleData) {
    const studentName = (student.firstName || '').substring(0, 20);
    const courseTitle = (bundleData.title || 'Course').substring(0, 30);
    const weeks = bundleData.courses ? bundleData.courses.length : 0;
    const subject = (bundleData.subject || '').substring(0, 18);
    let message = `Enrollment Confirmed!\nStudent: ${studentName}\nCourse: ${courseTitle}`;
    if (subject) message += `\nSubject: ${subject}`;
    message += `\nWeeks: ${weeks} included\nAccess all materials!\nELKABLY`;
    return this.truncateSmsMessage(message);
  }

  /**
   * Format time spent in human-readable format (e.g., "4.7 minutes" or "1 hour")
   */
  formatTimeSpent(minutes) {
    if (!minutes || minutes === 0) return '0 minutes';
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours > 0) {
      if (remainingMinutes > 0) {
        // Format remaining minutes with 1 decimal if needed
        const minsFormatted = remainingMinutes % 1 === 0 
          ? remainingMinutes.toString() 
          : remainingMinutes.toFixed(1);
        return `${hours} hour${hours > 1 ? 's' : ''} ${minsFormatted} minute${remainingMinutes !== 1 ? 's' : ''}`;
      } else {
        return `${hours} hour${hours > 1 ? 's' : ''}`;
      }
    } else {
      // Format minutes with 1 decimal if needed
      const minsFormatted = minutes % 1 === 0 
        ? minutes.toString() 
        : minutes.toFixed(1);
      return `${minsFormatted} minute${minutes !== 1 ? 's' : ''}`;
    }
  }

  /**
   * Generate SMS message for zoom meeting completion (140-160 chars) - Vertical format
   * Includes exact attendance percentage, camera status, and time spent
   * Includes "Joined Late" status if student joined 30+ minutes after meeting start
   */
  getSmsZoomMeetingMessage(student, meetingData) {
    const studentName = (student.firstName || '').substring(0, 20);
    const meetingName = (meetingData.meetingName || 'Live Session').substring(0, 25);
    // Format attendance percentage - show exact value (e.g., 88.5% or 88%)
    const attendancePercent = meetingData.attendancePercentage || 0;
    const attendancePercentFormatted = attendancePercent % 1 === 0 
      ? attendancePercent.toString() 
      : attendancePercent.toFixed(1);
    const courseTitle = (meetingData.courseTitle || 'Course').substring(0, 20);
    
    // Check camera status - if student opened camera for 80%+ of attendance time
    const cameraOpened = meetingData.cameraOpened || false;
    const cameraStatus = cameraOpened ? 'Camera: ON' : 'Camera: OFF';
    
    // Format time spent
    const timeSpent = meetingData.timeSpent || 0;
    const timeSpentFormatted = this.formatTimeSpent(timeSpent);
    
    // Check if student joined late (30+ minutes after meeting started)
    const joinedLate = meetingData.joinedLate || false;
    
    let message = `Live Session Update\nStudent: ${studentName}\nSession: ${meetingName}`;
    message += `\nCourse: ${courseTitle}`;
    message += `\nAttendance: ${attendancePercentFormatted}%`;
    message += `\nTime: ${timeSpentFormatted}`;
    
    // Add late status indicator if applicable
    if (joinedLate) {
      message += `\n⚠️ Joined Late`;
    }
    
    // message += `\n${cameraStatus}`;
    console.log(cameraStatus);
    if (attendancePercent >= 50) {
      message += `\nCompleted! Great job!\nELKABLY`;
    } else {
      message += `\nMore attendance needed\nELKABLY`;
    }
    return this.truncateSmsMessage(message);
  }

  /**
   * Generate SMS message for students who did NOT attend live session
   * Different message if they watched recording vs didn't watch at all
   */
  getSmsZoomMeetingNonAttendanceMessage(student, meetingData) {
    const studentName = (student.firstName || '').substring(0, 20);
    const meetingName = (meetingData.meetingName || 'Live Session').substring(0, 25);
    const courseTitle = (meetingData.courseTitle || 'Course').substring(0, 20);
    const watchedRecording = meetingData.watchedRecording || false;
    
    let message = `Live Session Update\nStudent: ${studentName}\nSession: ${meetingName}`;
    message += `\nCourse: ${courseTitle}`;
    
    if (watchedRecording) {
      message += `\nAttended recording\nsession (not live)\nELKABLY`;
    } else {
      message += `\nDid not attend\nlive session\nELKABLY`;
    }
    
    return this.truncateSmsMessage(message);
  }

  /**
   * Format phone number for WhatsApp
   */
  formatPhoneNumber(phoneNumber, countryCode) {
    let formatted = phoneNumber.replace(/\D/g, '');
    
    if (countryCode && !formatted.startsWith(countryCode.replace('+', ''))) {
      formatted = countryCode.replace('+', '') + formatted;
    }
    
    return `+${formatted}`;
  }

  /**
   * Send direct message to student
   * Automatically routes to SMS for Egyptian numbers, WhatsApp for others
   */
  async sendToStudent(studentId, whatsappMessage, smsMessage = null) {
    try {
      // Get student data
      const student = await User.findById(studentId);
      if (!student) {
        console.error('Student not found:', studentId);
        return { success: false, message: 'Student not found' };
      }

      const studentPhone = student.studentNumber;
      const studentCountryCode = student.studentCountryCode;
      
      if (!studentPhone) {
        console.error('Student phone number not found');
        return { success: false, message: 'Student phone number not found' };
      }
      
      // Check if number is Egyptian
      const isEgyptian = this.isEgyptianNumber(studentPhone, studentCountryCode);
      
      if (isEgyptian) {
        // Send via SMS for Egyptian numbers
        try {
          console.log(`📱 Sending SMS to Egyptian number: ${studentPhone} (${studentCountryCode})`);
          
          // Use provided SMS message or fallback to WhatsApp message
          let messageToSend = smsMessage || whatsappMessage;
          // Ensure WhatsApp link is included in SMS message
          messageToSend = this.ensureSmsMessageWithLink(messageToSend);
          
          const smsResult = await sendSms({
            recipient: studentPhone,
            message: messageToSend,
            senderId: 'ELKABLYTEAM'
          });
          
          console.log(`✅ SMS sent successfully to student ${student.firstName} ${student.lastName} (${studentPhone})`);
          return { 
            success: true, 
            message: 'SMS sent successfully',
            method: 'SMS',
            details: smsResult
          };
        } catch (smsError) {
          console.error('❌ SMS sending error:', smsError);
          return { 
            success: false, 
            message: `SMS failed: ${smsError.message || 'Unknown error'}`,
            method: 'SMS',
            error: smsError.details || smsError.message
          };
        }
      } else {
        // Send via WhatsApp for non-Egyptian numbers
        try {
          // Check if session API key is available
          if (!this.sessionApiKey) {
            console.error('Session API key is not configured');
            return { success: false, message: 'Session API key not configured' };
          }
          
          // Format phone number for WhatsApp
          const formattedPhone = this.formatPhoneNumber(studentPhone, studentCountryCode);
          
          console.log(`💬 Sending WhatsApp to non-Egyptian number: ${formattedPhone} (${studentCountryCode})`);
          
          // Remove WhatsApp link from WhatsApp messages
          const cleanedWhatsappMessage = this.removeWhatsAppLink(whatsappMessage);
          
          // Send message via WhatsApp
          const result = await wasender.sendTextMessage(
            this.sessionApiKey,
            formattedPhone,
            cleanedWhatsappMessage
          );

          if (result.success) {
            console.log(`✅ WhatsApp message sent to student ${student.firstName} ${student.lastName} (${formattedPhone})`);
            return { 
              success: true, 
              message: 'WhatsApp message sent successfully',
              method: 'WhatsApp'
            };
          } else {
            console.error('❌ Failed to send WhatsApp message:', result.message);
            return { 
              success: false, 
              message: result.message || 'Failed to send WhatsApp message',
              method: 'WhatsApp'
            };
          }
        } catch (whatsappError) {
          console.error('❌ WhatsApp sending error:', whatsappError);
          return { 
            success: false, 
            message: `WhatsApp failed: ${whatsappError.message || 'Unknown error'}`,
            method: 'WhatsApp',
            error: whatsappError.message
          };
        }
      }
    } catch (error) {
      console.error('❌ Error in sendToStudent:', error);
      return { success: false, message: 'Failed to send notification', error: error.message };
    }
  }

  /**
   * Send direct message to parent
   * Automatically routes to SMS for Egyptian numbers, WhatsApp for others
   */
  async sendToParent(studentId, whatsappMessage, smsMessage = null) {
    try {
      // Get student data
      const student = await User.findById(studentId);
      if (!student) {
        console.error('Student not found:', studentId);
        return { success: false, message: 'Student not found' };
      }

      const parentPhone = student.parentNumber;
      const parentCountryCode = student.parentCountryCode;
      
      // Check if number is Egyptian
      const isEgyptian = this.isEgyptianNumber(parentPhone, parentCountryCode);
      
      if (isEgyptian) {
        // Send via SMS for Egyptian numbers
        try {
          console.log(`📱 Sending SMS to Egyptian number: ${parentPhone} (${parentCountryCode})`);
          
          // Use provided SMS message or fallback to WhatsApp message
          let messageToSend = smsMessage || whatsappMessage;
          // Ensure WhatsApp link is included in SMS message
          messageToSend = this.ensureSmsMessageWithLink(messageToSend);
          
          const smsResult = await sendSms({
            recipient: parentPhone,
            message: messageToSend,
            senderId: 'ELKABLYTEAM'
          });
          
          console.log(`✅ SMS sent successfully to parent of ${student.firstName} ${student.lastName} (${parentPhone})`);
          return { 
            success: true, 
            message: 'SMS sent successfully',
            method: 'SMS',
            details: smsResult
          };
        } catch (smsError) {
          console.error('❌ SMS sending error:', smsError);
          // If SMS fails, don't fallback to WhatsApp - return error
          return { 
            success: false, 
            message: `SMS failed: ${smsError.message || 'Unknown error'}`,
            method: 'SMS',
            error: smsError.details || smsError.message
          };
        }
      } else {
        // Send via WhatsApp for non-Egyptian numbers
        try {
          // Check if session API key is available
          if (!this.sessionApiKey) {
            console.error('Session API key is not configured');
            return { success: false, message: 'Session API key not configured' };
          }
          
          // Format phone number for WhatsApp
          const formattedPhone = this.formatPhoneNumber(parentPhone, parentCountryCode);
          
          console.log(`💬 Sending WhatsApp to non-Egyptian number: ${formattedPhone} (${parentCountryCode})`);
          
          // Remove WhatsApp link from WhatsApp messages
          const cleanedWhatsappMessage = this.removeWhatsAppLink(whatsappMessage);
          
          // Send message via WhatsApp
          const result = await wasender.sendTextMessage(
            this.sessionApiKey,
            formattedPhone,
            cleanedWhatsappMessage
          );

          if (result.success) {
            console.log(`✅ WhatsApp message sent to parent of ${student.firstName} ${student.lastName} (${formattedPhone})`);
            return { 
              success: true, 
              message: 'WhatsApp message sent successfully',
              method: 'WhatsApp'
            };
          } else {
            console.error('❌ Failed to send WhatsApp message:', result.message);
            return { 
              success: false, 
              message: result.message || 'Failed to send WhatsApp message',
              method: 'WhatsApp'
            };
          }
        } catch (whatsappError) {
          console.error('❌ WhatsApp sending error:', whatsappError);
          return { 
            success: false, 
            message: `WhatsApp failed: ${whatsappError.message || 'Unknown error'}`,
            method: 'WhatsApp',
            error: whatsappError.message
          };
        }
      }
    } catch (error) {
      console.error('❌ Error in sendToParent:', error);
      return { success: false, message: 'Failed to send notification', error: error.message };
    }
  }

  /**
   * Send quiz completion notification
   */
  async sendQuizCompletionNotification(studentId, quizData, score, totalQuestions) {
    const student = await User.findById(studentId);
    if (!student) {
      console.error('Student not found:', studentId);
      return { success: false, message: 'Student not found' };
    }

    const percentage = Math.round((score / totalQuestions) * 100);
    const grade = `${score}/${totalQuestions}`;
    
    let performanceMessage = '';
    if (percentage >= 90) {
      performanceMessage = '🎉 Outstanding performance! Your student is excelling!';
    } else if (percentage >= 70) {
      performanceMessage = '👍 Good job! Your student is making great progress!';
    } else if (percentage >= 50) {
      performanceMessage = '📈 Your student is improving! Keep encouraging them!';
    } else {
      performanceMessage = '💪 Your student needs more practice! Keep supporting them!';
    }

    const completionDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // WhatsApp message
    const whatsappMessage = `📚 *Quiz Completed!*

🎓 *Student:* ${student.firstName || student.name}
📝 *Quiz:* ${quizData.title || 'Quiz'}
📊 *Grade:* ${grade} (${percentage}%)
📅 *Completed:* ${completionDate}

${performanceMessage}

🏆 *ELKABLY TEAM*`;

    // SMS message (max 160 chars)
    const smsMessage = this.getSmsQuizCompletionMessage(student, quizData, score, totalQuestions, percentage);

    return await this.sendToParent(studentId, whatsappMessage, smsMessage);
  }

  /**
   * Send content completion notification
   */
  async sendContentCompletionNotification(studentId, contentData, courseData) {
    const student = await User.findById(studentId);
    if (!student) {
      console.error('Student not found:', studentId);
      return { success: false, message: 'Student not found' };
    }

    const completionDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // WhatsApp message
    const whatsappMessage = `📖 *Content Progress!*

🎓 *Student:* ${student.firstName || student.name}
📚 *Week:* ${courseData.title || 'Week'}
📝 *Content:* ${contentData.title || 'Content'}
📅 *Completed:* ${completionDate}

🎉 Your student is making great progress! Keep encouraging them!

🏆 *ELKABLY TEAM*`;

    // SMS message (max 160 chars)
    const smsMessage = this.getSmsContentCompletionMessage(student, contentData, courseData);

    return await this.sendToParent(studentId, whatsappMessage, smsMessage);
  }

  /**
   * Send topic completion notification
   */
  async sendTopicCompletionNotification(studentId, topicData, courseData) {
    const student = await User.findById(studentId);
    if (!student) {
      console.error('Student not found:', studentId);
      return { success: false, message: 'Student not found' };
    }

    const completionDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // WhatsApp message
    const whatsappMessage = `📚 *Topic Completed!*

🎓 *Student:* ${student.firstName || student.name}
📖 *Week:* ${courseData.title || 'Week'}
📝 *Topic:* ${topicData.title || 'Topic'}
📅 *Completed:* ${completionDate}

🎉 Excellent work! Your student is moving forward with learning!

🏆 *ELKABLY TEAM*`;

    // SMS message (max 160 chars)
    const smsMessage = this.getSmsTopicCompletionMessage(student, topicData, courseData);

    return await this.sendToParent(studentId, whatsappMessage, smsMessage);
  }

  /**
   * Send course completion notification
   */
  async sendCourseCompletionNotification(studentId, courseData) {
    const student = await User.findById(studentId);
    if (!student) {
      console.error('Student not found:', studentId);
      return { success: false, message: 'Student not found' };
    }

    const completionDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // WhatsApp message
    const whatsappMessage = `🎓 *Week Completed!*

🎓 *Student:* ${student.firstName || student.name}
📚 *Week:* ${courseData.title || 'Week'}
📅 *Completed:* ${completionDate}

🏆 Congratulations! You have successfully completed the week!

🎉 Your student is doing excellent work!

🏆 *ELKABLY TEAM*`;

    // SMS message (max 160 chars)
    const smsMessage = this.getSmsCourseCompletionMessage(student, courseData);

    return await this.sendToParent(studentId, whatsappMessage, smsMessage);
  }

  /**
   * Send purchase notification (simple text message)
   */
  async sendPurchaseInvoiceNotification(studentId, purchaseData) {
    try {
      console.log('📱 Starting WhatsApp purchase notification for student:', studentId);
      
      const student = await User.findById(studentId);
      if (!student) {
        console.error('❌ Student not found:', studentId);
        return { success: false, message: 'Student not found' };
      }

      console.log('👤 Student found:', {
        name: `${student.firstName} ${student.lastName}`,
        phone: student.parentNumber,
        countryCode: student.parentCountryCode
      });

      const purchaseDate = new Date(purchaseData.createdAt || purchaseData.purchasedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      // WhatsApp message
      const whatsappMessage = `🎉 *Payment Confirmed Successfully!*

🎓 *Student:* ${student.firstName}

📦 *Order Number:* #${purchaseData.orderNumber || purchaseData._id}

📚 *Items:* ${purchaseData.items ? purchaseData.items.map(item => item.title).join(', ') : 'Week/Course'}

💰 *Total Amount:* EGP ${purchaseData.total || 0}

📅 *Purchase Date:* ${purchaseDate}

🏆 *ELKABLY TEAM*`;

      // SMS message (max 160 chars)
      const smsMessage = this.getSmsPurchaseMessage(student, purchaseData);

      console.log('📤 Sending message...');
      
      return await this.sendToParent(studentId, whatsappMessage, smsMessage);
    } catch (error) {
      console.error('❌ Error in sendPurchaseInvoiceNotification:', error);
      return { success: false, message: 'Failed to send purchase notification' };
    }
  }

  /**
   * Send welcome message to new student
   * Sends to both student and parent
   */
  async sendWelcomeMessage(studentId) {
    const student = await User.findById(studentId);
    if (!student) {
      console.error('Student not found:', studentId);
      return { success: false, message: 'Student not found' };
    }

    // WhatsApp message for student
    const studentWhatsappMessage = `🎉 *Welcome to ELKABLY!*

🎓 *Student:* ${student.firstName}
🆔 *Student Code:* ${student.studentCode}
🏫 *School:* ${student.schoolName}
📚 *Grade:* ${student.grade}

🎯 Your learning journey begins now!
📖 You can access your weeks and start learning today.

🏆 *ELKABLY TEAM*`;

    // WhatsApp message for parent
    const parentWhatsappMessage = `🎉 *Welcome to ELKABLY!*

🎓 *Student:* ${student.firstName}
🆔 *Student Code:* ${student.studentCode}
🏫 *School:* ${student.schoolName}
📚 *Grade:* ${student.grade}

🎯 Your student's learning journey begins now!
📖 Your student can access their weeks and start learning today.

🏆 *ELKABLY TEAM*`;

    // SMS messages (max 160 chars)
    const studentSmsMessage = this.getSmsWelcomeMessageStudent(student);
    const parentSmsMessage = this.getSmsWelcomeMessageParent(student);

    // Send to both student and parent
    const results = {
      student: null,
      parent: null
    };

    // Send to student if phone number exists
    if (student.studentNumber) {
      try {
        results.student = await this.sendToStudent(studentId, studentWhatsappMessage, studentSmsMessage);
      } catch (error) {
        console.error('Error sending welcome message to student:', error);
        results.student = { success: false, message: error.message };
      }
    } else {
      console.log('Student phone number not available, skipping student welcome message');
      results.student = { success: false, message: 'Student phone number not available' };
    }

    // Send to parent
    try {
      results.parent = await this.sendToParent(studentId, parentWhatsappMessage, parentSmsMessage);
    } catch (error) {
      console.error('Error sending welcome message to parent:', error);
      results.parent = { success: false, message: error.message };
    }

    // Return combined result
    return {
      success: (results.student?.success || !student.studentNumber) && results.parent?.success,
      student: results.student,
      parent: results.parent
    };
  }

  /**
   * Send course enrollment notification
   */
  async sendCourseEnrollmentNotification(studentId, courseData) {
    const student = await User.findById(studentId);
    if (!student) {
      console.error('Student not found:', studentId);
      return { success: false, message: 'Student not found' };
    }

    const enrollmentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // WhatsApp message
    const whatsappMessage = `📚 *Enrollment Confirmed!*

🎓 *Student:* ${student.firstName || student.name}
📖 *Week:* ${courseData.title || 'Week'}
📅 *Enrollment Date:* ${enrollmentDate}
📚 *Subject:* ${courseData.subject || 'Subject'}

🎯 Your student is now enrolled and ready to learn!
📖 Your student can access the week materials and start their learning journey.

🏆 *ELKABLY TEAM*`;

    // SMS message (max 160 chars)
    const smsMessage = this.getSmsCourseEnrollmentMessage(student, courseData);

    return await this.sendToParent(studentId, whatsappMessage, smsMessage);
  }

  /**
   * Send bundle enrollment notification
   */
  async sendBundleEnrollmentNotification(studentId, bundleData) {
    const student = await User.findById(studentId);
    if (!student) {
      console.error('Student not found:', studentId);
      return { success: false, message: 'Student not found' };
    }

    const enrollmentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // WhatsApp message
    const whatsappMessage = `📦 *Course Enrollment Confirmed!*

🎓 *Student:* ${student.firstName || student.name}
📚 *Course:* ${bundleData.title || 'Course'}
📖 *Weeks:* ${bundleData.courses ? bundleData.courses.length : 0} weeks included
📅 *Enrollment Date:* ${enrollmentDate}
📚 *Subject:* ${bundleData.subject || 'Subject'}

🎯 Your student is now enrolled in a comprehensive learning course!
📖 Your student can access all week materials and start their learning journey.

🏆 *ELKABLY TEAM*`;

    // SMS message (max 160 chars)
    const smsMessage = this.getSmsBundleEnrollmentMessage(student, bundleData);

    return await this.sendToParent(studentId, whatsappMessage, smsMessage);
  }

  /**
   * Send bulk message to multiple parents
   */
  async sendBulkMessage(studentIds, message) {
    const results = [];
    
    for (const studentId of studentIds) {
      try {
        const result = await this.sendToParent(studentId, message);
        results.push({
          studentId,
          success: result.success,
          message: result.message
        });
      } catch (error) {
        results.push({
          studentId,
          success: false,
          message: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Send message to course students
   */
  async sendMessageToCourseStudents(courseId, message) {
    try {
      const course = await Course.findById(courseId).populate('enrolledStudents');
      if (!course) {
        return { success: false, message: 'Course not found' };
      }

      const studentIds = course.enrolledStudents.map(student => student._id);
      return await this.sendBulkMessage(studentIds, message);
    } catch (error) {
      console.error('Error sending message to course students:', error);
      return { success: false, message: 'Failed to send message to course students' };
    }
  }

  /**
   * Send message to bundle students
   */
  async sendMessageToBundleStudents(bundleId, message) {
    try {
      const bundle = await BundleCourse.findById(bundleId).populate('enrolledStudents');
      if (!bundle) {
        return { success: false, message: 'Bundle not found' };
      }

      const studentIds = bundle.enrolledStudents.map(student => student._id);
      return await this.sendBulkMessage(studentIds, message);
    } catch (error) {
      console.error('Error sending message to bundle students:', error);
      return { success: false, message: 'Failed to send message to bundle students' };
    }
  }

  /**
   * Send message to all active students
   */
  async sendMessageToAllStudents(message) {
    try {
      const students = await User.find({ isActive: true, role: 'student' });
      const studentIds = students.map(student => student._id);
      return await this.sendBulkMessage(studentIds, message);
    } catch (error) {
      console.error('Error sending message to all students:', error);
      return { success: false, message: 'Failed to send message to all students' };
    }
  }

  /**
   * Send document/file via WhatsApp
   */
  async sendDocumentViaWhatsApp(phoneNumber, documentUrl, fileName, caption = '') {
    try {
      // Check if session API key is available
      if (!this.sessionApiKey) {
        console.error('Session API key is not configured');
        return { success: false, message: 'Session API key not configured' };
      }

      // Format phone number for WhatsApp (same as book shipping code)
      // Remove all non-digit characters
      let cleaned = phoneNumber.replace(/\D/g, '');
      
      // If starts with 0, replace with country code 20 (Egypt)
      if (cleaned.startsWith('0')) {
        cleaned = '20' + cleaned.substring(1);
      }
      
      // If doesn't start with country code, add 20 (default to Egypt format)
      if (!cleaned.startsWith('20') && !cleaned.startsWith('+')) {
        cleaned = '20' + cleaned;
      }
      
      // Remove + if present
      cleaned = cleaned.replace(/^\+/, '');
      
      // Format as WhatsApp JID: countrycode@s.whatsapp.net (same format as book shipping)
      const whatsappJid = `${cleaned}@s.whatsapp.net`;

      console.log(`📎 Sending document via WhatsApp to: ${whatsappJid}`);
      console.log(`📄 File: ${fileName}`);
      console.log(`🔗 URL: ${documentUrl}`);

      // Send document via WhatsApp using wasender
      const wasender = require('./wasender');
      const result = await wasender.sendDocumentMessage(
        this.sessionApiKey,
        whatsappJid,
        documentUrl,
        fileName
      );

      if (result.success) {
        console.log(`✅ Document sent successfully via WhatsApp to ${whatsappJid}`);
        return { 
          success: true, 
          message: 'Document sent successfully',
          method: 'WhatsApp'
        };
      } else {
        console.error('❌ Failed to send document via WhatsApp:', result.message);
        return { 
          success: false, 
          message: result.message || 'Failed to send document via WhatsApp',
          method: 'WhatsApp'
        };
      }
    } catch (error) {
      console.error('❌ Error sending document via WhatsApp:', error);
      return { 
        success: false, 
        message: `WhatsApp failed: ${error.message || 'Unknown error'}`,
        method: 'WhatsApp',
        error: error.message
      };
    }
  }


}

module.exports = new WhatsAppSMSNotificationService();
