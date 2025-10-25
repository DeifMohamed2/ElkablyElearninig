const wasender = require('./wasender');
const User = require('../models/User');
const Course = require('../models/Course');
const BundleCourse = require('../models/BundleCourse');
const cloudinary = require('./cloudinary');

class WhatsAppNotificationService {
  constructor() {
    this.sessionApiKey = process.env.WASENDER_SESSION_API_KEY || process.env.WHATSAPP_SESSION_API_KEY || '';
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
   * Send direct message to parent
   */
  async sendToParent(studentId, message) {
    try {
      // Get student data
      const student = await User.findById(studentId);
      if (!student) {
        console.error('Student not found:', studentId);
        return { success: false, message: 'Student not found' };
      }

      // Get parent phone number
      const parentPhone = this.formatPhoneNumber(student.parentNumber, student.parentCountryCode);
      
      // Check if session API key is available
      if (!this.sessionApiKey) {
        console.error('Session API key is not configured');
        return { success: false, message: 'Session API key not configured' };
      }
      
      // Send message
      const result = await wasender.sendTextMessage(
        this.sessionApiKey,
        parentPhone,
        message
      );

      if (result.success) {
        console.log(`WhatsApp message sent to parent of ${student.name} (${parentPhone})`);
        return { success: true, message: 'Message sent successfully' };
      } else {
        console.error('Failed to send WhatsApp message:', result.message);
        return { success: false, message: result.message };
      }
    } catch (error) {
      console.error('Error sending WhatsApp notification:', error);
      return { success: false, message: 'Failed to send notification' };
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

    const message = `📚 *Quiz Completed!*

🎓 *Student:* ${student.name}
📝 *Quiz:* ${quizData.title || 'Quiz'}
📊 *Grade:* ${grade} (${percentage}%)
📅 *Completed:* ${completionDate}

${performanceMessage}

🏆 *ELKABLY TEAM*`;

    return await this.sendToParent(studentId, message);
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

    const message = `📖 *Content Progress!*

🎓 *Student:* ${student.name}
📚 *Week:* ${courseData.title || 'Week'}
📝 *Content:* ${contentData.title || 'Content'}
📅 *Completed:* ${completionDate}

🎉 Your student is making great progress! Keep encouraging them!

🏆 *ELKABLY TEAM*`;

    return await this.sendToParent(studentId, message);
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

    const message = `📚 *Topic Completed!*

🎓 *Student:* ${student.name}
📖 *Week:* ${courseData.title || 'Week'}
📝 *Topic:* ${topicData.title || 'Topic'}
📅 *Completed:* ${completionDate}

🎉 Excellent work! Your student is moving forward with learning!

🏆 *ELKABLY TEAM*`;

    return await this.sendToParent(studentId, message);
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

    const message = `🎓 *Week Completed!*

🎓 *Student:* ${student.name}
📚 *Week:* ${courseData.title || 'Week'}
📅 *Completed:* ${completionDate}

🏆 Congratulations! You have successfully completed the week!

🎉 Your student is doing excellent work!

🏆 *ELKABLY TEAM*`;

    return await this.sendToParent(studentId, message);
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

      // Create a simple text message
      const message = `🎉 *Payment Confirmed Successfully!*

🎓 *Student:* ${student.firstName} ${student.lastName}

📦 *Order Number:* #${purchaseData.orderNumber || purchaseData._id}

📚 *Items:* ${purchaseData.items ? purchaseData.items.map(item => item.title).join(', ') : 'Week/Course'}

💰 *Total Amount:* EGP ${purchaseData.total || 0}

📅 *Purchase Date:* ${purchaseDate}

🏆 *ELKABLY TEAM*`;

      console.log('📤 Sending WhatsApp message...');
      
      // Send simple text message
      return await this.sendToParent(studentId, message);
    } catch (error) {
      console.error('❌ Error in sendPurchaseInvoiceNotification:', error);
      return { success: false, message: 'Failed to send purchase notification' };
    }
  }

  /**
   * Send welcome message to new student
   */
  async sendWelcomeMessage(studentId) {
    const student = await User.findById(studentId);
    if (!student) {
      console.error('Student not found:', studentId);
      return { success: false, message: 'Student not found' };
    }

    const message = `🎉 *Welcome to ELKABLY!*

🎓 *Student:* ${student.name}
🆔 *Student Code:* ${student.studentCode}
🏫 *School:* ${student.schoolName}
📚 *Grade:* ${student.grade}

🎯 Your student's learning journey begins now!
📖 Your student can access their weeks and start learning today.

🏆 *ELKABLY TEAM*`;

    return await this.sendToParent(studentId, message);
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

    const message = `📚 *Enrollment Confirmed!*

🎓 *Student:* ${student.name}
📖 *Week:* ${courseData.title || 'Week'}
📅 *Enrollment Date:* ${enrollmentDate}
📚 *Subject:* ${courseData.subject || 'Subject'}

🎯 Your student is now enrolled and ready to learn!
📖 Your student can access the week materials and start their learning journey.

🏆 *ELKABLY TEAM*`;

    return await this.sendToParent(studentId, message);
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

    const message = `📦 *Course Enrollment Confirmed!*

🎓 *Student:* ${student.name}
📚 *Course:* ${bundleData.title || 'Course'}
📖 *Weeks:* ${bundleData.courses ? bundleData.courses.length : 0} weeks included
📅 *Enrollment Date:* ${enrollmentDate}
📚 *Subject:* ${bundleData.subject || 'Subject'}

🎯 Your student is now enrolled in a comprehensive learning course!
📖 Your student can access all week materials and start their learning journey.

🏆 *ELKABLY TEAM*`;

    return await this.sendToParent(studentId, message);
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


}

module.exports = new WhatsAppNotificationService();
