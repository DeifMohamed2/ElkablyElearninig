const User = require('../models/User');
const Group  = require('../models/Group');
const Card = require('../models/Card');
const Attendance = require('../models/Attendance'); 

const wasender = require('../utils/wasender');
const Excel = require('exceljs'); 
const QRCode = require('qrcode');

// Helper function to validate and format phone numbers
function validateAndFormatPhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') {
    throw new Error('Phone number is required and must be a string');
  }
  
  // Remove any non-numeric characters
  let cleanPhone = phone.replace(/\D/g, '');
  
  // Check if we have any digits
  if (cleanPhone.length === 0) {
    throw new Error('Phone number contains no digits');
  }
  
  // Check for invalid patterns (all zeros, all ones, etc.)
  if (/^0+$/.test(cleanPhone) || /^1+$/.test(cleanPhone)) {
    throw new Error('Phone number contains only repeated digits');
  }
  
  // Handle different input formats for Egyptian numbers
  if (cleanPhone.length === 11 && cleanPhone.startsWith('0') && cleanPhone.charAt(1) === '1') {
    // Egyptian mobile format (01xxxxxxxxx) -> convert to international (20xxxxxxxxxx)
    return '20' + cleanPhone.substring(1);
  } else if (cleanPhone.startsWith('20') && cleanPhone.length === 12 && cleanPhone.charAt(2) === '1') {
    // Already in Egyptian international format (20xxxxxxxxxx)
    return cleanPhone;
  } else if (cleanPhone.length === 10 && cleanPhone.startsWith('1')) {
    // Egyptian local format without 0 (1xxxxxxxxx) -> convert to international (201xxxxxxxxx)
    return '20' + cleanPhone;
  } else {
    // For non-Egyptian numbers or other formats, return as is without modification
    console.log(`Non-Egyptian number detected: ${cleanPhone} - using without country code modification`);
    return cleanPhone;
  }
}


  
const dash_get = async(req, res) => {

  res.render('teacher/dash', { title: 'DashBoard', path: req.path });
};

const myStudent_get = (req, res) => {
  res.render('teacher/myStudent', {
    title: 'Mystudent',
    path: req.path,
    userData: null,
    attendance: null,
  });
};

// =================================================== Student Requests ================================================ //

let query;
const studentsRequests_get = async (req, res) => {
  try {
    const {
      centerName,
      Grade,
      gradeType,
      groupTime,
      attendingType,
      GradeLevel,
      page = 1,
    } = req.query;

    // Build the query dynamically
    query = { centerName, Grade, gradeType, groupTime };
    if (attendingType) query.attendingType = attendingType;
    if (GradeLevel) query.GradeLevel = GradeLevel;

    // Pagination variables
    const perPage = 500;

    // Execute the query with pagination
    const [result, count] = await Promise.all([
      User.find(query, {
        Username: 1,
        Code: 1,
        balance: 1,
        amountRemaining: 1,
        createdAt: 1,
        updatedAt: 1,
      })
        .sort({ subscribe: 1, createdAt: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .exec(),
      User.countDocuments(query),
    ]);

    // Calculate pagination details
    const nextPage = parseInt(page) + 1;
    const hasNextPage = nextPage <= Math.ceil(count / perPage);
    const hasPreviousPage = page > 1;

    // Render the response
    res.render('teacher/studentsRequests', {
      title: 'StudentsRequests',
      path: req.path,
      modalData: null,
      modalDelete: null,
      studentsRequests: result,
      Grade,
      isSearching: false,
      nextPage: hasNextPage ? nextPage : null,
      previousPage: hasPreviousPage ? page - 1 : null,
    });
  } catch (error) {
    console.error('Error in studentsRequests_get:', error);
    res.status(500).send('Internal Server Error');
  }
};


const searchForUser = async (req, res) => {
  const { searchBy, searchInput } = req.body;
  try {
    await User.find(
      { [`${searchBy}`]: searchInput },
      {
        Username: 1,
        Code: 1,
        createdAt: 1,
        updatedAt: 1,
        subscribe: 1,
        balance :1,
        amountRemaining :1,
      }
    ).then((result) => {
      res.render('teacher/studentsRequests', {
        title: 'StudentsRequests',
        path: req.path,
        modalData: null,
        modalDelete: null,
        studentsRequests: result,
        studentPlace: query.place || 'All',
        Grade: query.Grade,
        isSearching: true,
        nextPage: null,
        previousPage: null, // Calculate previous page
      });
    });
  } catch (error) {}
};

const converStudentRequestsToExcel = async (req, res) => {
  try {
    // Fetch user data with only the required fields
    const users = await User.find(query, {
      Username: 1,
      Code: 1,
      phone: 1,
      parentPhone: 1,
      schoolName: 1,
    });

    // Create a new Excel workbook
    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('Students Data');

    // Add headers with proper spacing
    const headerRow = worksheet.addRow([
      'User Name',
      'Student Code',
      'School Name',
      'Phone Number',
      'Parent Phone Number',
    ]);
    
    // Style headers - bold text only, no colors
    headerRow.font = { bold: true, size: 12 };
    
    // Set column widths for better spacing
    worksheet.columns = [
      { key: 'Username', width: 25 },
      { key: 'Code', width: 15 },
      { key: 'schoolName', width: 30 },
      { key: 'phone', width: 20 },
      { key: 'parentPhone', width: 20 },
    ];

    // Add user data to the worksheet - no colors, simple formatting
    users.forEach((user) => {
      const row = worksheet.addRow([
        user.Username || '',
        user.Code || '',
        user.schoolName || '',
        user.phone || '',
        user.parentPhone || '',
      ]);
      
      // Simple formatting - no colors, just clean data
      row.font = { size: 11 };
    });

    const excelBuffer = await workbook.xlsx.writeBuffer();

    // Set response headers for file download
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="StudentsData.xlsx"`
    );

    // Send Excel file as response
    res.send(excelBuffer);
  } catch (error) {
    console.error('Error occurred:', error);
    res.status(500).send('An error occurred while generating Excel file.');
  }
};

const getSingleUserAllData = async (req, res) => {
  try {
    const studentID = req.params.studentID;
    console.log(studentID);
    await User.findOne(
      { _id: studentID },
     
    ).then((result) => {

      res.status(200).send(result);
    }).catch((error) => {
      console.log(error);
    });
  } catch (error) {
    console.log(error);
    
  }
};

const updateUserData = async (req, res) => {
  try {
    const {
      Username,
      phone,
      parentPhone,
      balance,
 
      absences,
      amountRemaining,
      GradeLevel,
      attendingType,
      bookTaken,
      schoolName,
    } = req.body;
    const { studentID } = req.params;

    // Validate required fields
    if (!studentID) {
      return res.status(400).json({ error: 'Student ID is required.' });
    }

    // Build the update object dynamically
    const updateFields = {};
    if (Username) updateFields.Username = Username;
    if (phone) updateFields.phone = phone;
    if (parentPhone) updateFields.parentPhone = parentPhone;
    if (balance !== undefined) updateFields.balance = balance;
    if (amountRemaining !== undefined)
      updateFields.amountRemaining = amountRemaining;
    if (GradeLevel) updateFields.GradeLevel = GradeLevel;
    if (attendingType) updateFields.attendingType = attendingType;
    if (bookTaken !== undefined) updateFields.bookTaken = bookTaken === 'true';
    if (schoolName) updateFields.schoolName = schoolName;
    if (absences) updateFields.absences = absences

    // Optional fields with additional checks
    // if (centerName) updateFields.centerName = centerName;
    // if (Grade) updateFields.Grade = Grade;
    // if (gradeType) updateFields.gradeType = gradeType;
    // if (groupTime) updateFields.groupTime = groupTime;

    // Get the current user data to compare changes
    const currentUser = await User.findById(studentID);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Update the student document
    const updatedUser = await User.findByIdAndUpdate(studentID, updateFields, {
      new: true,
    });

    // Check if bookTaken status was changed and send WhatsApp message
    const newBookTakenValue = bookTaken === 'true';
    if (bookTaken !== undefined && newBookTakenValue !== currentUser.bookTaken) {
      try {
        console.log(`Book taken status changed for ${updatedUser.Username} from ${currentUser.bookTaken} to ${newBookTakenValue}`);
        
        const bookStatusMessage = `📚 تحديث حالة الكتاب\n\nالطالب: ${updatedUser.Username}\nالكود: ${updatedUser.Code}\n\nحالة الكتاب: ${newBookTakenValue ? 'تم استلام الكتاب ✅' : 'لم يتم استلام الكتاب ❌'}\n\nتاريخ التحديث: ${new Date().toLocaleDateString('ar-EG')}`;
        
        // Send message to student's phone
        const studentPhone = updatedUser.phone;
        const adminPhone = updatedUser.centerName === 'ZHub' ? '01200077825' : 
                          updatedUser.centerName === 'tagmo3' ? '01200077823' : 
                          updatedUser.centerName === 'online' ? '01015783223' : '01200077825';
        
        await sendWasenderMessage(bookStatusMessage, studentPhone, adminPhone);
        console.log(`Book status message sent successfully to ${updatedUser.Username}`);
        
        // Also send to parent's phone if different from student's phone
        if (updatedUser.parentPhone && updatedUser.parentPhone !== studentPhone) {
          const parentMessage = `📚 تحديث حالة الكتاب لطفلك\n\nالطالب: ${updatedUser.Username}\nالكود: ${updatedUser.Code}\n\nحالة الكتاب: ${newBookTakenValue ? 'تم استلام الكتاب ✅' : 'لم يتم استلام الكتاب ❌'}\n\nتاريخ التحديث: ${new Date().toLocaleDateString('ar-EG')}`;
          await sendWasenderMessage(parentMessage, updatedUser.parentPhone, adminPhone);
          console.log(`Book status message sent to parent of ${updatedUser.Username}`);
        }
      } catch (whatsappError) {
        console.error('Failed to send book status WhatsApp message:', whatsappError.message);
        // Don't fail the update if WhatsApp message fails
      }
    }

    // Handle group update only if centerName is provided
    // if (centerName) {
    //   console.log('Updating group data...');
    //   // Remove the student from any previous group
    //   await Group.updateMany(
    //     { students: updatedUser._id },
    //     { $pull: { students: updatedUser._id } }
    //   );

    //   // Find the new group
    //   const newGroup = await Group.findOne({
    //     CenterName: centerName,
    //     Grade,
    //     gradeType,
    //     GroupTime: groupTime,
    //   });

    //   if (!newGroup) {
    //     return res.status(404).json({ error: 'Target group not found.' });
    //   }

    //   // Add the student to the new group
    //   if (!newGroup.students.includes(updatedUser._id)) {
    //     newGroup.students.push(updatedUser._id);
    //     await newGroup.save();
    //   }
    // }

    // Redirect or send a success response
    return res
      .status(200)
      .json({ message: 'User data updated successfully.', updatedUser });
  } catch (error) {
    console.error('Error updating user data:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};


// const confirmDeleteStudent = async (req, res) => {
//   try {
//     const studentID = req.params.studentID;
//     res.render('teacher/studentsRequests', {
//       title: 'StudentsRequests',
//       path: req.path,
//       modalData: null,
//       modalDelete: studentID,
//       studentsRequests: null,
//       studentPlace: query.place || 'All',
//       Grade: query.Grade,
//       isSearching: false,
//       nextPage: null,
//       previousPage: null, // Calculate previous page
//     });
//   } catch (error) {}
// };

const DeleteStudent = async (req, res) => {
  try {
    const studentID = req.params.studentID;
    if (!studentID) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (
      studentID == '668138aeebc1138a4277c47a' ||
      studentID == '668138edebc1138a4277c47c' ||
      studentID == '66813909ebc1138a4277c47e'
    ) {
      return res.status(400).json({ error: 'You can not delete this user' });
    }

    await Group.updateMany(
      { students: studentID },
      { $pull: { students: studentID } }
    ).then(async(result) => {
      await User.findByIdAndDelete(studentID).then((result) => {
        return res
          .status(200)
          .json({ message: 'User deleted successfully.', result });
      });
  });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};
// =================================================== END Student Requests ================================================ //

// ===================================================  MyStudent ================================================ //

const searchToGetOneUserAllData = async (req, res) => {
  const { searchBy, searchInput } = req.query;

  try {
     const result = await User.findOne({ [`${searchBy}`]: searchInput })

     const attendance = await Card.findOne({ userId : result._id })


      res.render('teacher/myStudent', {
        title: 'Mystudent',
        path: req.path,
        userData: result,
        attendance: attendance.cardHistory,
      });
   
  } catch (error) {}
};

const convertToExcelAllUserData = async (req, res) => {
  const { studetCode } = req.params;
  console.log(studetCode);
  try {
    await User.findOne({ Code: +studetCode })
      .then(async (user) => {
        // Create a new Excel workbook
        const workbook = new Excel.Workbook();
        const worksheet = workbook.addWorksheet('Users Data');
        const Header = worksheet.addRow([`بيانات الطالب ${user.Username} `]);
        Header.getCell(1).alignment = { horizontal: 'center' }; // Center align the text
        Header.font = { bold: true, size: 16 };
        Header.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'DDDDDD' },
        };
        worksheet.mergeCells('A1:H1');
        worksheet.addRow();
        const headerRowUserBasicInfo = worksheet.addRow([
          'اسم الطالب',
          'كود الطالب ',
          'رقم هاتف الطالب',
          'رقم هاتف ولي الامر',
        ]);
        headerRowUserBasicInfo.font = { bold: true };
        headerRowUserBasicInfo.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFF00' },
        };

        // Add user data to the worksheet with alternating row colors

        const rowUserBasicInfo = worksheet.addRow([
          user.Username,
          user.Code,
          user.phone,
          user.parentPhone,
        ]);
        rowUserBasicInfo.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'DDDDDD' },
        };

        const headerRowUserVideoInfo = worksheet.addRow([
          '#',
          'اسم الفيديو',
          'عدد مرات المشاهده',
          'عدد المشاهدات المتبقيه ',
          'تاريخ اول مشاهده ',
          'تاريخ اخر مشاهده ',
          'رفع الواجب ',
          'حل الامتحان ',
          'حاله الشراء ',
        ]);
        headerRowUserVideoInfo.font = { bold: true };
        headerRowUserVideoInfo.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '9fea0c' },
        };
        let c = 0;

        user['videosInfo'].forEach((data) => {
          c++;
          let homeWork, Exam;
          if (data.prerequisites == 'WithOutExamAndHW') {
            homeWork = 'لا يوجد';
            Exam = 'لا يوجد';
          } else if (data.prerequisites == 'WithExamaAndHw') {
            homeWork = data.isHWIsUploaded ? 'تم الرفع' : 'لم يُرفع';
            Exam = data.isUserEnterQuiz ? 'تم الدخول' : 'لم يدخل';
          } else if (data.prerequisites == 'WithHw') {
            homeWork = data.isHWIsUploaded ? 'تم الرفع' : 'لم يُرفع';
          } else {
            Exam = data.isUserEnterQuiz ? 'تم الدخول' : 'لم يدخل';
          }

          const headerRowUserVideoInfo = worksheet.addRow([
            c,
            data.videoName,
            data.numberOfWatches,
            data.videoAllowedAttemps,
            new Date(data.fristWatch).toLocaleDateString() || 'لم يشاهد بعد',
            new Date(data.lastWatch).toLocaleDateString() || 'لم يشاهد بعد',
            homeWork,
            Exam,
            data.isVideoPrepaid
              ? data.videoPurchaseStatus
                ? 'تم الشراء'
                : 'لم يتم الشراء'
              : 'الفيديو مجاني',
          ]);

          if (c % 2 === 0) {
            headerRowUserVideoInfo.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'DDDDDD' },
            };
          }
        });
        const headerRowUserQuizInfo = worksheet.addRow([
          '#',
          'اسم الامتحان',
          'تاريخ الحل ',
          'مده الحل ',
          ' درجه الامتحان ',
          'حاله الشراء ',
        ]);
        headerRowUserQuizInfo.font = { bold: true };
        headerRowUserQuizInfo.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '10a1c2' },
        };

        let cq = 0;
        user['quizesInfo'].forEach((data) => {
          cq++;
          const headerRowUserQuizInfo = worksheet.addRow([
            cq,
            data.quizName,
            new Date(data.solvedAt).toLocaleDateString() || 'لم يحل',
            data.solveTime || 'لم يحل',
            data.questionsCount + '/' + data.Score,
            data.isQuizPrepaid
              ? data.quizPurchaseStatus
                ? 'تم الشراء'
                : 'لم يتم الشراء'
              : 'الامتحان مجاني',
          ]);
          if (cq % 2 === 0) {
            headerRowUserQuizInfo.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'DDDDDD' },
            };
          }
        });

        const excelBuffer = await workbook.xlsx.writeBuffer();

        // Set response headers for file download
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=users_data.xlsx'
        );

        // Send Excel file as response
        res.send(excelBuffer);
      })
      .catch((error) => {
        console.log(error);
      });
  } catch (error) {
    console.log(error);
  }
};

// =================================================== END MyStudent ================================================ //

async function sendWasenderMessage(message, phone, adminPhone, isExcel = false, countryCode = '20') {
  try {
    // Get all sessions to find the one with matching phone number
    const sessionsResponse = await wasender.getAllSessions();
    if (!sessionsResponse.success) {
      throw new Error(`WhatsApp sessions unavailable: ${sessionsResponse.message}`);
    }
    
    const sessions = sessionsResponse.data;
    
    if (!sessions || sessions.length === 0) {
      throw new Error('No WhatsApp sessions found - Please check WhatsApp connection');
    }
    
    let targetSession = null;
    
    // Find session by admin phone number
    if (adminPhone == '01200077825') {
      targetSession = sessions.find(s => s.phone_number === '+201200077825' || s.phone_number === '01200077825');
    } else if (adminPhone == '01200077823') {
      targetSession = sessions.find(s => s.phone_number === '+201200077823' || s.phone_number === '01200077823');
    } else if (adminPhone == '01015783223') {
      targetSession = sessions.find(s => s.phone_number === '+201015783223' || s.phone_number === '01015783223');
    }
    
    // If no specific match, try to find any connected session
    if (!targetSession) {
      targetSession = sessions.find(s => s.status === 'connected');
    }
    
    if (!targetSession) {
      // Check if there are sessions but none are connected
      const disconnectedSessions = sessions.filter(s => s.status !== 'connected');
      if (disconnectedSessions.length > 0) {
        const statuses = disconnectedSessions.map(s => `${s.name}: ${s.status}`).join(', ');
        throw new Error(`WhatsApp sessions exist but none are connected. Statuses: ${statuses}`);
      } else {
        throw new Error('WhatsApp not connected - No active session found');
      }
    }
    
    if (!targetSession.api_key) {
      throw new Error('WhatsApp session expired - API key not available');
    }
    
    // Check session status more thoroughly
    if (targetSession.status === 'disconnected') {
      throw new Error('WhatsApp session disconnected - Please reconnect');
    } else if (targetSession.status === 'connecting') {
      throw new Error('WhatsApp session still connecting - Please wait and try again');
    } else if (targetSession.status === 'failed') {
      throw new Error('WhatsApp session failed - Please check connection and try again');
    }
    
    console.log(`Using session: ${targetSession.name} (${targetSession.phone_number})`);
    
    // Debug: Log the original phone number
    console.log('Original phone number:', phone, 'Type:', typeof phone, 'Length:', phone ? phone.length : 'null/undefined');
    
    // Validate and format phone number using helper function
    let phoneNumber;
    try {
      phoneNumber = validateAndFormatPhoneNumber(phone);
      console.log('Formatted phone number:', phoneNumber, 'Original:', phone);
    } catch (validationError) {
      throw new Error(`Phone number validation failed: ${validationError.message}`);
    }
    
    // Format for WhatsApp (add @s.whatsapp.net suffix)
    const formattedPhone = `${phoneNumber}@s.whatsapp.net`;
    
    console.log('Sending message to:', formattedPhone);
    
    // Use the session-specific API key to send the message
    const response = await wasender.sendTextMessage(targetSession.api_key, formattedPhone, message);
    
    // Debug: Log the full response for troubleshooting
    console.log('Full WhatsApp API Response:', JSON.stringify(response, null, 2));
    
    if (!response.success) {
      // Debug: Log the response structure
      console.log('WhatsApp API Response:', {
        success: response.success,
        message: response.message,
        error: response.error,
        errorType: typeof response.error,
        errorKeys: response.error && typeof response.error === 'object' ? Object.keys(response.error) : 'N/A'
      });
      
      // Check for specific API errors
      if (response.error) {
        // Convert error to string and check for specific patterns
        const errorStr = String(response.error).toLowerCase();
        
        if (errorStr.includes('not-authorized') || errorStr.includes('unauthorized')) {
          throw new Error('WhatsApp session expired - Please reconnect');
        } else if (errorStr.includes('not-found') || errorStr.includes('notfound') || errorStr.includes('does not exist on whatsapp')) {
          console.log(`WhatsApp Error: Phone number ${phoneNumber} is not registered on WhatsApp`);
          throw new Error('Phone number not registered on WhatsApp - Please check if the parent has WhatsApp installed');
        } else if (errorStr.includes('blocked') || errorStr.includes('block')) {
          throw new Error('Phone number blocked this WhatsApp account');
        } else if (errorStr.includes('invalid') || errorStr.includes('format')) {
          throw new Error('Invalid phone number format');
        } else if (errorStr.includes('rate-limit') || errorStr.includes('rate limit') || errorStr.includes('too many')) {
          throw new Error('Rate limit exceeded - Please wait before sending more messages');
        } else if (errorStr.includes('timeout')) {
          throw new Error('Request timeout - WhatsApp service slow');
        } else if (errorStr.includes('connection') || errorStr.includes('network')) {
          throw new Error('Network connection issue - Please check internet');
        } else {
          // Try to extract more specific error information
          if (response.details && response.details.error) {
            throw new Error(`WhatsApp API error: ${response.details.error}`);
          } else if (response.status) {
            // Handle specific HTTP status codes
            let errorMessage = 'Unknown error';
            
            if (response.status === 422) {
              // 422 typically means validation error
              if (response.error && typeof response.error === 'object') {
                if (response.error.message) {
                  errorMessage = response.error.message;
                } else if (response.error.error) {
                  errorMessage = response.error.error;
                } else if (response.error.detail) {
                  errorMessage = response.error.detail;
                } else if (response.error.description) {
                  errorMessage = response.error.description;
                } else if (response.error.validation) {
                  errorMessage = `Validation error: ${response.error.validation}`;
                } else if (response.error.constraints) {
                  errorMessage = `Validation failed: ${response.error.constraints}`;
                } else {
                  // Try to find any string value in the object
                  const errorValues = Object.values(response.error).filter(val => typeof val === 'string');
                  if (errorValues.length > 0) {
                    errorMessage = errorValues[0];
                  } else {
                    errorMessage = 'Phone number validation failed';
                  }
                }
              } else if (typeof response.error === 'string') {
                errorMessage = response.error;
              } else {
                errorMessage = 'Phone number validation failed - Check format';
              }
            } else {
              // Handle other status codes
              if (response.error && typeof response.error === 'object') {
                if (response.error.message) {
                  errorMessage = response.error.message;
                } else if (response.error.error) {
                  errorMessage = response.error.error;
                } else if (response.error.detail) {
                  errorMessage = response.error.detail;
                } else if (response.error.description) {
                  errorMessage = response.error.description;
                } else {
                  // Try to find any string value in the object
                  const errorValues = Object.values(response.error).filter(val => typeof val === 'string');
                  if (errorValues.length > 0) {
                    errorMessage = errorValues[0];
                  } else {
                    errorMessage = JSON.stringify(response.error);
                  }
                }
              } else if (typeof response.error === 'string') {
                errorMessage = response.error;
              }
            }
            
            throw new Error(`WhatsApp API error (Status: ${response.status}): ${errorMessage}`);
          } else {
            throw new Error(`WhatsApp API error: ${response.error}`);
          }
        }
      } else {
        // Check if we have additional error details
        if (response.details && response.details.message) {
          throw new Error(`Message sending failed: ${response.details.message}`);
        } else if (response.status) {
          throw new Error(`Message sending failed (Status: ${response.status}): ${response.message}`);
        } else {
          throw new Error(`Message sending failed: ${response.message}`);
        }
      }
    }
    
    return response.data;
  } catch (err) {
    console.error('Error sending WhatsApp message:', err.message);
    
    // Provide more specific error messages based on error type
    if (err.message.includes('fetch')) {
      throw new Error('Network error - Check internet connection');
    } else if (err.message.includes('timeout')) {
      throw new Error('Request timeout - WhatsApp service may be slow');
    } else if (err.message.includes('ECONNREFUSED')) {
      throw new Error('WhatsApp service unavailable - Please try again later');
    } else if (err.message.includes('ENOTFOUND')) {
      throw new Error('WhatsApp service not found - Check configuration');
    } else {
      throw err; // Re-throw the original error if it's already specific
    }
  }
}



async function sendWappiMessage(message, phone, adminPhone, isExcel = false) {
  return sendWasenderMessage(message, phone, adminPhone, isExcel);
}



const addCardGet = async (req, res) => {
  
  res.render('teacher/addCard', { title: 'addCard', path: req.path });
}

const addCardToStudent = async (req, res) => {
  const { studentCode, assignedCard } = req.body;

  // Check for missing fields
  if (!studentCode || !assignedCard) {
    return res
      .status(400)
      .json({ message: 'studentCode and assignedCard are required' , Username  : null});
  }

  try {
    const userByCode = await User.findOne({ Code: studentCode }, { cardId :1 , Username : 1 , Code : 1 });
    const userHasCard = await User.findOne({ cardId: assignedCard });
    if (!userByCode) {
      return res.status(400).json({ message: 'This student does not exist, please verify the code' ,Username   : ''});
    }

    if(userByCode.cardId){
      return res.status(400).json({ message: 'This student already has a card.' ,Username   : userByCode.Username});
    }

    if (userHasCard) {
      return res.status(400).json({ message: "This card has already been used." ,Username   : `Used by ${userHasCard.Username}`});
    }

    

      await User.updateOne(
        { Code: studentCode },
        {
          cardId: assignedCard,
        }
      ).then((result) => {
        return res.status(200).json({ message: 'تم اضافه الكارت للطالب بنجاح' ,Username   : userByCode.Username});
      }).catch((err) => {
        console.error(err);
        return res.status(500).json({ message: 'يبدو ان هناك خطأ ما ' ,Username   : null});
      });

  } catch (error) {
    console.error('Error adding card:', error);
    return res.status(500).json({ message:'يبدو ان هناك خطأ ما ' ,Username   : null});
  }
};


const markAttendance = async (req, res) => {
  const {
    Grade,
    centerName,
    GroupTime,
    attendId,
    gradeType,
    attendAbsencet,
    attendOtherGroup,
    attendWithHW,
    attendWithoutHW,
    // HWwithOutSteps,
    // attendWithOutHW,
  } = req.body;

  try {
    
    const student = await User.findOne({
      $or: [{ cardId: attendId }, { Code: +attendId }],
    });

    if (!student) {
      return res.status(404).json({ message: 'Student Not found' });
    }

    let HWmessage ='';
// if(attendWithOutHW){
//   HWmessage = '*تم تسجيل حضور الطالب بدون واجب*';
// }else if(HWwithOutSteps){
//   HWmessage = '*لقد قام الطالب بحل الواجب لكن بدون خطوات*';
// }else{
//   HWmessage = '*لقد قام الطالب بحل الواجب بالخطوات*';
// }


      console.log(student._id);
    // Check if student is in the group
    let group =null;
        if (!attendOtherGroup) {
          group = await Group.findOne({
            CenterName: centerName,
            Grade: Grade,
            GroupTime: GroupTime,
            gradeType: gradeType,
            students: student._id,
          });
        }else{
          group = await Group.findOne({
            CenterName: centerName,
            Grade: Grade,
            GroupTime: GroupTime,
            gradeType: gradeType,
          });
        }

     if (!group) {
            return res
              .status(404)
              .json({ message: 'Student Not Found in This Group' });
     }
    


   let message = '';
    if (student.absences >= 3) {

      if (attendAbsencet){
        student.absences -= 1;
       
      }else{
        return res.status(400).json({
          message: 'Student has already been marked absent 3 times',
        });
      }
      
    }


    
    // Mark student as present in today's attendance
    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Cairo', // Egypt's time zone
    }).format(new Date());

    let attendance = await Attendance.findOne({
        date: today,
        groupId: group._id,
    });

    if (!attendance) {
      attendance = new Attendance({
        date: today,
        groupId: group._id,
        studentsPresent: [],
        studentsAbsent: [],
        studentsLate: [],
        isFinalized: false,
      });
    }

  
    // Check if student is already marked as present
    if (attendance.studentsPresent.includes(student._id)) {
      return res
        .status(400)
        .json({ message: 'Student is already marked present' });
    }
    // Check if student is already marked as Late
    if (attendance.studentsLate.includes(student._id)) {
      return res
        .status(400)
        .json({ message: 'Student is already marked Late' });
    }
    if (attendance.studentsExcused.includes(student._id)) {
      return res
        .status(400)
        .json({
          message: 'Student is already marked present From Other Group',
        });
    }



    // Handle if attendance is finalized (late marking logic)
    if (attendance.isFinalized) {
      attendance.studentsAbsent = attendance.studentsAbsent.filter(
        (id) => !id.equals(student._id)
      );
      attendance.studentsLate.push(student._id);

      if (student.absences > 0) {
        student.absences -= 1;
      }

      await attendance.save();

      // Find if an attendance history already exists for today
      const existingHistory = student.AttendanceHistory.find(
        (record) => record.date === today
      );

      if (existingHistory) {
        // Update the status to 'Late' if an entry already exists
        existingHistory.status = 'Late';
        existingHistory.atTime = new Date().toLocaleTimeString();

        // Mark AttendanceHistory as modified to ensure Mongoose updates it
        student.markModified('AttendanceHistory');
      } else {
        // Push a new history entry if it doesn't exist for today
        student.AttendanceHistory.push({
          attendance: attendance._id,
          date: today,
          atTime: new Date().toLocaleTimeString(),
          status: 'Late',
        });
      }

      // Save with validation disabled to avoid required field errors
      try {
        await student.save({ validateBeforeSave: false });
      } catch (saveError) {
        console.warn(`Error saving student ${student.Username} (ID: ${student._id}):`, saveError.message);
        // Continue with attendance marking even if student save fails
      }

      // Populate the students data for response
      await attendance.populate('studentsLate');
      await attendance.populate('studentsPresent');
      await attendance.populate('studentsExcused');

      const messageWappi = `⚠️ *عزيزي ولي أمر الطالب ${student.Username}*،\n
نود إعلامكم بأنه تم التحديث ابنكم قد *تأخر في الحضور اليوم*.\n
وقد تم تسجيل حضوره *متأخرًا*.\n
وحضر في جروب *${centerName} - ${Grade} - ${GroupTime}*.\n
عدد مرات الغياب: *${student.absences}*.\n\n
*يرجى الانتباه لمواعيد الحضور مستقبلًا*.\n\n
التاريخ: ${today}
*شكرًا لتعاونكم.*`;

      // Send the message via the waapi (already present)
      try {
        // Check if parent phone exists
        if (!student.parentPhone) {
          console.log(`Warning: No parent phone for student ${student.Username} (ID: ${student._id})`);
        } else {
          console.log(`Sending WhatsApp message to parent phone: ${student.parentPhone} for student: ${student.Username}`);
          await sendWappiMessage(messageWappi, student.parentPhone, req.userData.phone);
          console.log('WhatsApp message sent successfully for late attendance');
        }
      } catch (whatsappError) {
        console.error('WhatsApp message error for late attendance:', whatsappError.message);
        // Continue with attendance marking even if WhatsApp fails
        // The attendance is already saved, so we don't want to fail the entire operation
      }

 
      return res.status(200).json({
        message: 'The Student Marked As Late \n' + message,
        studentsPresent: attendance.studentsPresent,
        studentsLate: attendance.studentsLate,
        studentsExcused: attendance.studentsExcused,
      });
    } else {

          let message = '';
          if (student.absences == 2) {
            message = 'The student has 2 absences and 1 remaining';
          }
          // // Check if student is already marked absent 3 times
          // if (student.absences >= 3) {
          //   return res
          //     .status(400)
          //     .json({
          //       message: 'Student has already been marked absent 3 times',
          //     });
          // }
          let statusMessage =''
          if(attendOtherGroup){
            attendance.studentsExcused.push(student._id);
            statusMessage = 'Present From Other Group'
          }else{

           attendance.studentsPresent.push(student._id);
            statusMessage = 'Present'
          }
          


      await attendance.save();

      // Populate the students data for response
      await attendance.populate('studentsLate');
      await attendance.populate('studentsPresent');
      await attendance.populate('studentsExcused');
      console.log(attendance.studentsExcused);

      if (attendOtherGroup){
        student.AttendanceHistory.push({
          attendance: attendance._id,
          date: today,
          atTime: new Date().toLocaleTimeString(),
          status: 'Present From Other Group',
        });
      } else {
        student.AttendanceHistory.push({
          attendance: attendance._id,
          date: today,
          atTime: new Date().toLocaleTimeString(),
          status: 'Present',
        });
      }

      let hwLine = '';
      if (attendWithHW) {
        hwLine = `\nوقد قام الطالب بحل الواجب.`;
      } else if (attendWithoutHW) {
        hwLine = `\nولم يقم الطالب بحل الواجب.`;
      }

const messageWappi = `✅ *عزيزي ولي أمر الطالب ${student.Username}*،\n
نود إعلامكم بأن ابنكم قد *حضر اليوم في المعاد المحدد*.\n
وقد تم تسجيل حضوره *بنجاح*.${hwLine}\n
وحضر في جروب *${centerName} - ${Grade} - ${GroupTime}*.\n
عدد مرات الغياب: *${student.absences}*.\n
التاريخ: ${today}
*شكرًا لتعاونكم.*`;


      // Send the message via the waapi (already present)
      try {
        // Check if parent phone exists
        if (!student.parentPhone) {
          console.log(`Warning: No parent phone for student ${student.Username} (ID: ${student._id})`);
        } else {
          console.log(`Sending WhatsApp message to parent phone: ${student.parentPhone} for student: ${student.Username}`);
          await sendWappiMessage(messageWappi, student.parentPhone, req.userData.phone);
          console.log('WhatsApp message sent successfully');
        }
      } catch (whatsappError) {
        console.error('WhatsApp message error:', whatsappError.message);
        // Continue with attendance marking even if WhatsApp fails
        // The attendance is already saved, so we don't want to fail the entire operation
      }

      // Save with validation disabled to avoid required field errors
      try {
        await student.save({ validateBeforeSave: false });
      } catch (saveError) {
        console.warn(`Error saving student ${student.Username} (ID: ${student._id}):`, saveError.message);
        // Continue with attendance marking even if student save fails
      }
      return res.status(200).json({
        message:
          `Attendance marked successfully as ${statusMessage}  \n` + message,
        studentsPresent: attendance.studentsPresent,
        studentsLate: attendance.studentsLate,
        studentsExcused: attendance.studentsExcused,
      });
    }
  } catch (error) {
    console.error('Error marking attendance:', error);
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
};


const getAttendedUsers = async (req, res) => {
  const { Grade, centerName, GroupTime, attendId, gradeType } = req.body;
  const group = await Group.findOne({
    CenterName: centerName,
    Grade: Grade,
    gradeType : gradeType,
    GroupTime: GroupTime,
  });

  if (!group) {
    return res
      .status(404)
      .json({
        message: 'There are currently no students registered in this group',
      });
  }

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', // Egypt's time zone
  }).format(new Date());

  console.log(today); // Should give you the correct date in 'YYYY-MM-DD' format

  const attendance = await Attendance.findOne({
    groupId: group._id,
    date: today,
  }).populate('studentsPresent studentsLate studentsExcused');
  console.log(attendance);
  if (!attendance) {
    return res
      .status(404)
      .json({ message: 'Attendance records have not been submitted yet' });
  }

  return res.status(200).json({ attendance });
};


const removeAttendance = async (req, res) => {
  const { centerName, Grade, GroupTime, gradeType } = req.body;
  const studentId = req.params.studentId;

  try {
    // Fetch the student
    const student = await User.findById(studentId);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Find the group the student belongs to
    const group = await Group.findOne({
      CenterName: centerName,
      Grade: Grade,
      GroupTime: GroupTime,
      gradeType : gradeType,
      students: student._id, // Ensure the student is part of this group
    });

    if (!group) {
      return res
        .status(404)
        .json({ message: 'Student not found in this group' });
    }

    // Find today's attendance for the group
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', // Egypt's time zone
    }).format(new Date());
    const attendance = await Attendance.findOne({
      date: today,
      groupId: group._id,
    });

    if (!attendance) {
      return res
        .status(404)
        .json({ message: 'No attendance record found for today' });
    }

    // Check if the student is in the present or late lists
    const isPresent = attendance.studentsPresent.some((id) =>
      id.equals(student._id)
    );
    const isLate = attendance.studentsLate.some((id) => id.equals(student._id));

    if (!isPresent && !isLate) {
      return res
        .status(400)
        .json({ message: 'Student is not marked as present or late today' });
    }

    // Remove the student from studentsPresent if present
    if (isPresent) {
      attendance.studentsPresent = attendance.studentsPresent.filter(
        (id) => !id.equals(student._id)
      );
    }

    // Remove the student from studentsLate if late
    if (isLate) {
      attendance.studentsLate = attendance.studentsLate.filter(
        (id) => !id.equals(student._id)
      );
    }

    // // Optionally, add the student to studentsAbsent if not already there
    // if (!attendance.studentsAbsent.includes(student._id)) {
    //   attendance.studentsAbsent.push(student._id);
    // }

    // Save the updated attendance record
    await attendance.save();

    // Remove the attendance record from the student's history
    student.AttendanceHistory = student.AttendanceHistory.filter(
      (att) => !att.attendance.equals(attendance._id) // Use .equals() for ObjectId comparison
    );

    // Save with validation disabled to avoid required field errors
    try {
      await student.save({ validateBeforeSave: false });
    } catch (saveError) {
      console.warn(`Error saving student ${student.Username} (ID: ${student._id}):`, saveError.message);
      // Continue with attendance removal even if student save fails
    }
    return res.status(200).json({
      message: 'Attendance removed successfully',
      studentsPresent: attendance.studentsPresent,
      studentsLate: attendance.studentsLate,
      studentsAbsent: attendance.studentsAbsent,
    });
  } catch (error) {
    console.error('Error removing attendance:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};


const updateAmount = async (req, res) => {
  const amountRemaining = req.body.amountRemaining || 0;
  const studentId = req.params.studentId;

  try {
    const student = await User.findById(studentId);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    student.amountRemaining = amountRemaining;
    // Save with validation disabled to avoid required field errors
    try {
      await student.save({ validateBeforeSave: false });
    } catch (saveError) {
      console.warn(`Error saving student ${student.Username} (ID: ${student._id}):`, saveError.message);
      return res.status(500).json({ message: 'Error updating student data' });
    }
    
    return res.status(200).json({ message: 'Amount updated successfully' });
  }
  catch (error) {
    console.error('Error updating amount:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

const finalizeAttendance = async (req, res) => {
  const { centerName, Grade, GroupTime, gradeType } = req.body;

  try {
    // Find the group
    const group = await Group.findOne({
      CenterName: centerName,
      Grade: Grade,
      gradeType : gradeType,
      GroupTime: GroupTime,
    });

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Find today's attendance record for the group
      const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', // Egypt's time zone
  }).format(new Date());

    let attendance = await Attendance.findOne({
      groupId: group._id,
      date: today,
    });

    if (!attendance) {
      return res
        .status(404)
        .json({ message: 'No attendance record found for today' });
    }

    if (attendance.isFinalized) {
      return res.status(400).json({ message: 'Attendance already finalized' });
    }

    const groupStudentIds = group.students;

    for (const studentId of groupStudentIds) {
  
      const isPresent = attendance.studentsPresent.some((id) =>
        id.equals(studentId)
      );
      const isLate = attendance.studentsLate.some((id) => id.equals(studentId));

      console.log( isPresent , isLate);
      if (!isPresent && !isLate) {
      
        if (!attendance.studentsAbsent.includes(studentId)) {
          attendance.studentsAbsent.push(studentId);

          const student = await User.findById(studentId);
         
          if (student) {
          
            student.absences = (student.absences || 0) + 1;
            student.AttendanceHistory.push({  
              attendance: attendance._id,
              date: today,
              atTime : new Date().toLocaleTimeString(),
              status: 'Absent',
            });
            
            // Save with validation disabled to avoid required field errors
            try {
              await student.save({ validateBeforeSave: false });
            } catch (saveError) {
              console.warn(`Error saving student ${student.Username} (ID: ${student._id}):`, saveError.message);
              // Continue with other students even if one fails to save
            }
          }
        }
      }
    }

    attendance.isFinalized = true;
    await attendance.save();
    await attendance.populate('studentsAbsent');
    await attendance.populate('studentsPresent');
    await attendance.populate('studentsExcused');
 
  

    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Data');

    // Add title row
    const titleRow = worksheet.addRow(['Attendance Report']);
    titleRow.font = { size: 27, bold: true };
    worksheet.mergeCells('A1:H1');
    titleRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add group info
    const groupInfoRow = worksheet.addRow([
      'Grade',
      'Center Name',
      'Group Time',
      'Date',
    ]);
    groupInfoRow.font = { bold: true };

    worksheet.addRow([Grade, centerName, GroupTime, today]);

    // Add present students section
    let row = worksheet.addRow([]);
    row = worksheet.addRow(['Present Students']);
    row.font = { bold: true, size: 16, color: { argb: 'ff1aad00' } };
    worksheet.mergeCells(`A${row.number}:H${row.number}`);
    row.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add present students data
    const headerRow = worksheet.addRow([
      '#',
      'Student Name',
      'Student Code',
      'Phone',
      'Parent Phone',
      'Absences',
      'Amount',
      'Amount Remaining',
    ]);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };

    worksheet.columns.forEach((column) => {
      column.width = 20;
    });

    let c = 0;
    let totalAmount = 0;
    let totalAmountRemaining = 0;

    attendance.studentsPresent.forEach(async(student) => {
      c++;
      const row = worksheet.addRow([
        c,
        student.Username,
        student.Code,
        student.phone,
        student.parentPhone,
        student.absences,
        student.balance,
        student.amountRemaining,
      ]);
      row.font = { size: 13 };

      // Add values to totals
      totalAmount += student.balance;
      totalAmountRemaining += student.amountRemaining;

      if (c % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'DDDDDD' },
        };
      }

    });

    // Add total row for Present Students
    const totalRowPresent = worksheet.addRow([
      '',
      '',
      '',
      '',
      '',
      'Total',
      totalAmount,
      totalAmountRemaining,
    ]);
    totalRowPresent.font = { bold: true };
    totalRowPresent.getCell(6).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };
    totalRowPresent.getCell(7).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };
    totalRowPresent.getCell(8).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };

    // Add present Other Group students section
    row = worksheet.addRow(['Present From Other Group Students']);
    row.font = { bold: true, size: 16, color: { argb: 'ff1aad00' } };
    worksheet.mergeCells(`A${row.number}:H${row.number}`);
    row.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add present students data
    const headerRow3 = worksheet.addRow([
      '#',
      'Student Name',
      'Student Code',
      'Phone',
      'Parent Phone',
      'Absences',
      'Amount',
      'Amount Remaining',
      'Group Info' ,
    ]);
    headerRow3.font = { bold: true };
    headerRow3.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };

    worksheet.columns.forEach((column) => {
      column.width = 20;
    });

    let c3 = 0;
    let totalAmount3 = 0;
    let totalAmountRemaining3 = 0;

    attendance.studentsExcused.forEach(async(student) => {
      c3++;
      const row = worksheet.addRow([
        c3,
        student.Username,
        student.Code,
        student.phone,
        student.parentPhone,
        student.absences,
        student.balance,
        student.amountRemaining,
        `${student.centerName} - ${student.Grade} - ${student.gradeType} - ${student.groupTime}`,
      ]);
      row.font = { size: 13 };

      // Add values to totals
      totalAmount3 += student.balance;
      totalAmountRemaining3 += student.amountRemaining;

      if (c3 % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'DDDDDD' },
        };
      }

const messageWappi = `✅ *عزيزي ولي أمر الطالب ${student.Username}*،\n
نود إعلامكم بأن ابنكم قد *حضر اليوم في المعاد المحدد*.\n
وقد تم تسجيل حضوره *بنجاح*.\n
المبلغ المتبقي من سعر الحصة هو: *${student.amountRemaining} جنيه*.\n
عدد مرات الغياب: *${student.absences}*.\n\n
*شكرًا لتعاونكم.*`;


      // Send the message via the waapi (already present)
      await sendWappiMessage(messageWappi, student.parentPhone,req.userData.phone);



    });

    // Add total row for Present Other Group  Students
    const totalRowPresent3 = worksheet.addRow([
      '',
      '',
      '',
      '',
      '',
      'Total',
      totalAmount3,
      totalAmountRemaining3,
    ]);
    totalRowPresent3.font = { bold: true };
    totalRowPresent3.getCell(6).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };
    totalRowPresent3.getCell(7).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };
    totalRowPresent3.getCell(8).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };

    // Add absent students section
    row = worksheet.addRow(['Absent Students']);
    row.font = { bold: true, size: 16, color: { argb: 'FF0000' } };
    worksheet.mergeCells(`A${row.number}:H${row.number}`);
    row.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add absent students data
    const headerRow2 = worksheet.addRow([
      '#',
      'Student Name',
      'Student Code',
      'Phone',
      'Parent Phone',
      'Absences',
      'Amount',
      'Amount Remaining',
    ]);
    headerRow2.font = { bold: true };
    headerRow2.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };

    let c2 = 0;
    attendance.studentsAbsent.forEach(async(student) => {
      c2++;
      const row = worksheet.addRow([
        c2,
        student.Username,
        student.Code,
        student.phone,
        student.parentPhone,
        student.absences,
        student.balance,
        student.amountRemaining,
      ]);
      row.font = { size: 13 };


      if (c2 % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'DDDDDD' },
        };
      }



let subMessage = '';
if (student.absences >= 3) {
  subMessage = `\n\n❌ *وفقًا لعدد مرات الغياب التي تم تسجيلها لابنكم*، يرجى العلم أنه *لن يتمكن من دخول الحصة القادمة*.`;
}

const messageWappi = `❌ *عزيزي ولي أمر الطالب ${student.Username}*،\n
نود إعلامكم بأن ابنكم *لم يحضر اليوم*.\n
وقد تم تسجيل غيابه .\n
عدد مرات الغياب: *${student.absences}*.${subMessage}\n\n
*شكرًا لتعاونكم.*`;
 

      // Send the message via the waapi (already present)
      await sendWappiMessage(messageWappi, student.parentPhone,req.userData.phone);

 

    });

 

    // Add borders to all cells
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    const excelBuffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=attendance_data.xlsx'
    );

    res.send(excelBuffer);
  } catch (error) {
    console.error('Error finalizing attendance:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};




// =================================================== END Add Card  &&  Attendance =================================================== //



// =================================================== Handel Attendance =================================================== //

const handelAttendanceGet = async (req, res) => {
 
  res.render('teacher/handelAttendance', { title: 'handelAttendance', path: req.path });
}


const getDates = async (req, res) => {
  const { Grade, centerName, GroupTime , gradeType } = req.body;
  console.log(Grade, centerName, GroupTime);
  try {
    const group = await Group.findOne({ Grade, CenterName: centerName, GroupTime , gradeType });

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const attendanceRecords = await Attendance.find({ groupId: group._id });
    console.log(attendanceRecords);
    if (!attendanceRecords) {
      return res.status(404).json({ message: 'No attendance records found for this session.' });
    }

    const dates = attendanceRecords.map((record) => record.date);
    return res.status(200).json({ Dates: dates });
  } catch (error) {
    console.error('Error fetching dates:', error);
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }

}

const getAttendees = async (req, res) => {
    const { Grade, centerName, GroupTime, gradeType, date } = req.body;

    try {
      const group = await Group.findOne({
        Grade,
        CenterName: centerName,
        GroupTime,
        gradeType,
      });

      if (!group) {
        return res.status(404).json({ message: 'Group not found' });
      }

      const attendance = await Attendance.findOne({ groupId: group._id, date }).populate('studentsPresent studentsAbsent studentsLate studentsExcused');

      if (!attendance) {
        return res.status(404).json({ message: 'No attendance record found for this session.' });
      }

      return res.status(200).json({ attendance , message: 'Attendance record found successfully' });
    } catch (error) {
      console.error('Error fetching attendees:', error);
      return res.status(500).json({ message: 'Server error. Please try again.' });

}

}

const convertAttendeesToExcel = async (req, res) => {
  const { centerName, Grade, GroupTime , gradeType } = req.body;

  try {
    // Find the group
    const group = await Group.findOne({
      CenterName: centerName,
      Grade: Grade,
      GroupTime: GroupTime,
      gradeType: gradeType,
    });

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Find today's attendance record for the group
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', // Egypt's time zone
    }).format(new Date());

    let attendance = await Attendance.findOne({
      groupId: group._id,
      date: today,
    }).populate('studentsPresent studentsAbsent studentsLate studentsExcused');

    if (!attendance) {
      return res
        .status(404)
        .json({ message: 'No attendance record found for today' });
    }

    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Data');

    // Add title row
    const titleRow = worksheet.addRow(['Attendance Report']);
    titleRow.font = { size: 27, bold: true };
    worksheet.mergeCells('A1:H1');
    titleRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add group info
    const groupInfoRow = worksheet.addRow([
      'Grade',
      'Center Name',
      'Group Time',
      'Date',
    ]);
    groupInfoRow.font = { bold: true };

    worksheet.addRow([Grade, centerName, GroupTime, today]);

    // Add present students section
    let row = worksheet.addRow([]);
    row = worksheet.addRow(['Present Students']);
    row.font = { bold: true, size: 16, color: { argb: 'ff1aad00' } };
    worksheet.mergeCells(`A${row.number}:H${row.number}`);
    row.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add present students data
    const headerRow = worksheet.addRow([
      '#',
      'Student Name',
      'Student Code',
      'Phone',
      'Parent Phone',
      'Absences',
      'Amount',
      'Amount Remaining',
    ]);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };

    worksheet.columns.forEach((column) => {
      column.width = 20;
    });

    let c = 0;
    let totalAmount = 0;
    let totalAmountRemaining = 0;

    attendance.studentsPresent.forEach((student) => {
      c++;
      const row = worksheet.addRow([
        c,
        student.Username,
        student.Code,
        student.phone,
        student.parentPhone,
        student.absences,
        student.balance,
        student.amountRemaining,
      ]);
      row.font = { size: 13 };

      // Add values to totals
      totalAmount += student.balance;
      totalAmountRemaining += student.amountRemaining;

      if (c % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'DDDDDD' },
        };
      }
    });

    // Add total row for Present Students
    const totalRowPresent = worksheet.addRow([
      '',
      '',
      '',
      '',
      '',
      'Total',
      totalAmount,
      totalAmountRemaining,
    ]);
    totalRowPresent.font = { bold: true, size: 15 };
    totalRowPresent.getCell(6).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };
    totalRowPresent.getCell(7).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };
    totalRowPresent.getCell(8).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };

    // Add absent students section
    row = worksheet.addRow(['Absent Students']);
    row.font = { bold: true, size: 16, color: { argb: 'FF0000' } };
    worksheet.mergeCells(`A${row.number}:H${row.number}`);
    row.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add absent students data
    const headerRow2 = worksheet.addRow([
      '#',
      'Student Name',
      'Student Code',
      'Phone',
      'Parent Phone',
      'Absences',
      'Amount',
      'Amount Remaining',
    ]);
    headerRow2.font = { bold: true };
    headerRow2.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };

    let c2 = 0;

    attendance.studentsAbsent.forEach((student) => {
      c2++;
      const row = worksheet.addRow([
        c2,
        student.Username,
        student.Code,
        student.phone,
        student.parentPhone,
        student.absences,
        student.balance,
        student.amountRemaining,
      ]);
      row.font = { size: 13 };

      if (c2 % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'DDDDDD' },
        };
      }
    });

    // Add late students section
    row = worksheet.addRow(['Late Students']);
    row.font = { bold: true, size: 16, color: { argb: 'FFA500' } };
    worksheet.mergeCells(`A${row.number}:H${row.number}`);
    row.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add late students data
    const headerRow3 = worksheet.addRow([
      '#',
      'Student Name',
      'Student Code',
      'Phone',
      'Parent Phone',
      'Absences',
      'Amount',
      'Amount Remaining',
    ]);
    headerRow3.font = { bold: true };
    headerRow3.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };

    let c3 = 0;
    let totalAmountLate = 0;
    let totalAmountRemainingLate = 0;

    attendance.studentsLate.forEach((student) => {
      c3++;
      const row = worksheet.addRow([
        c3,
        student.Username,
        student.Code,
        student.phone,
        student.parentPhone,
        student.absences,
        student.balance,
        student.amountRemaining,
      ]);
      row.font = { size: 13 };

      // Add values to totals
      totalAmountLate += student.balance;
      totalAmountRemainingLate += student.amountRemaining;

      if (c3 % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'DDDDDD' },
        };
      }
    });

    // Add total row for Late Students
    const totalRowLate = worksheet.addRow([
      '',
      '',
      '',
      '',
      '',
      'Total',
      totalAmountLate,
      totalAmountRemainingLate,
    ]);
    totalRowLate.font = { bold: true, size: 15 };
    totalRowLate.getCell(6).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };
    totalRowLate.getCell(7).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };
    totalRowLate.getCell(8).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };

    // Add present Other Group students section
    row = worksheet.addRow(['Present From Other Group Students']);
    row.font = { bold: true, size: 16, color: { argb: 'ff1aad00' } };
    worksheet.mergeCells(`A${row.number}:H${row.number}`);
    row.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add present students data
    const headerRow4 = worksheet.addRow([
      '#',
      'Student Name',
      'Student Code',
      'Phone',
      'Parent Phone',
      'Absences',
      'Amount',
      'Amount Remaining',
      'Group Info',
    ]);
    headerRow4.font = { bold: true };
    headerRow4.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };

    worksheet.columns.forEach((column) => {
      column.width = 20;
    });

    let c4 = 0;
    let totalAmount4 = 0;
    let totalAmountRemaining4 = 0;

    attendance.studentsExcused.forEach(async (student) => {
      c4++;
      const row = worksheet.addRow([
        c4,
        student.Username,
        student.Code,
        student.phone,
        student.parentPhone,
        student.absences,
        student.balance,
        student.amountRemaining,
        `${student.centerName} - ${student.Grade} - ${student.gradeType} - ${student.groupTime}`,
      ]);
      row.font = { size: 13 };

      // Add values to totals
      totalAmount4 += student.balance;
      totalAmountRemaining4 += student.amountRemaining;

      if (c4 % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'DDDDDD' },
        };
      }

      const messageWappi = `✅ *عزيزي ولي أمر الطالب ${student.Username}*،\n
نود إعلامكم بأن ابنكم قد *حضر اليوم في المعاد المحدد*.\n
وقد تم تسجيل حضوره *بنجاح*.\n
المبلغ المتبقي من سعر الحصة هو: *${student.totalAmount4} جنيه*.\n
عدد مرات الغياب: *${student.absences}*.\n\n
*شكرًا لتعاونكم.*`;


      // Send the message via the waapi (already present)
      await sendWappiMessage(messageWappi, student.parentPhone,req.userData.phone);

    });

    // Add total row for Present Other Group  Students
    const totalRowPresent4 = worksheet.addRow([
      '',
      '',
      '',
      '',
      '',
      'Total',
      totalAmount4,
      totalAmountRemaining4,
    ]);
    totalRowPresent4.font = { bold: true };
    totalRowPresent4.getCell(6).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };
    totalRowPresent4.getCell(7).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };
    totalRowPresent4.getCell(8).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };

    // Add borders to all cells
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    const excelBuffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=attendance_data.xlsx'
    );

    res.send(excelBuffer);
  } catch (error) {
    console.error('Error finalizing attendance:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};


// =================================================== END Handel Attendance =================================================== //



// =================================================== My Student Data =================================================== //

const getStudentData = async (req, res) => {
  const studentCode = req.params.studentCode;
  const { start, end } = req.query; // Extract start and end dates from query parameters

  try {
    // Find student based on the provided code
    const student = await User.findOne({ Code: studentCode });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    let attendanceHistory = student.AttendanceHistory;

    // Filter attendance based on date range if provided
    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      attendanceHistory = attendanceHistory.filter((record) => {
        const recordDate = new Date(record.date);
        return recordDate >= startDate && recordDate <= endDate;
      });
    }

    // Build a response object with relevant fields and filtered attendance history
    const studentData = {
      Code: student.Code,
      Username: student.Username,
      centerName: student.centerName,
      groupTime: student.groupTime,
      phone: student.phone,
      parentPhone: student.parentPhone,
      absences: student.absences,
      balance: student.balance,
      amountRemaining: student.amountRemaining,
      attendanceHistory: attendanceHistory.map((record) => ({
        date: record.date,
        status: record.status,
        time: record.atTime,
      })), // Map attendance history for easy response format
    };
    console.log(studentData);
    // Return the student data in the response
    return res.status(200).json(studentData);
  } catch (error) {
    console.error('Error fetching student data:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};


const fs = require('fs');
const path = require('path');

// Define a directory where reports will be stored
const reportsDirectory = path.join(__dirname, 'attendance_reports');

// Ensure the directory exists
if (!fs.existsSync(reportsDirectory)) {
  fs.mkdirSync(reportsDirectory);
}

const convertAttendaceToExcel = async (req, res) => {
  const studentCode = req.params.studentCode;
  console.log(studentCode);
  try {
    // Find student based on the provided code
    const student = await User.findOne({ Code: studentCode });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const workbook = new Excel.Workbook();

    const worksheet = workbook.addWorksheet('Attendance Data');

    // Add title row
    const titleRow = worksheet.addRow(['Attendance Report']);

    titleRow.font = { size: 27, bold: true };

    worksheet.mergeCells('A1:H1');

    titleRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add student info
    const studentInfoRow = worksheet.addRow([
      'Student Name',
      'Student Code',
      'Phone',
      'Parent Phone',
      'Absences',
      'Amount',
      'Amount Remaining',
    ]);

    studentInfoRow.font = { bold: true };

    worksheet.addRow([
      student.Username,
      student.Code,
      student.phone,
      student.parentPhone,
      student.absences,
      student.balance,
      student.amountRemaining,
    ]);

    // Add attendance history section
    let row = worksheet.addRow([]);

    row = worksheet.addRow(['Attendance History']);

    row.font = { bold: true, size: 16, color: { argb: 'ff1aad00' } };

    worksheet.mergeCells(`A${row.number}:H${row.number}`);

    row.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add attendance history data

    const headerRow = worksheet.addRow(['Date', 'Status', 'Time']);

    headerRow.font = { bold: true };

    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' },
    };

    worksheet.columns.forEach((column) => {
      column.width = 20;
    });

    student.AttendanceHistory.forEach((record) => {
      const row = worksheet.addRow([record.date, record.status, record.atTime]);
      row.font = { size: 13 };
    });

    // Add borders to all cells

    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });
  const buffer = await workbook.xlsx.writeBuffer(); // Generates buffer from workbook
  const base64Excel = buffer.toString('base64'); 
    // Define the file path to save the report locally
    const fileName = `${studentCode}_attendance.xlsx`;
    const filePath = path.join(reportsDirectory, fileName);

    // Save the Excel file to the local filesystem
    await workbook.xlsx.writeFile(filePath);

    // Create a public URL to the file (you may need to expose the directory statically)
    const fileUrl = `${req.protocol}://${req.get(
      'host'
    )}/attendance_reports/${fileName}`;

    // Use WhatsApp API to send the URL
    // await sendWappiMessage(fileUrl, student.parentPhone, req.userData.phone)
    const excelBuffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    res.setHeader(
      'Content-Disposition',
      'attachment; filename=attendance_data.xlsx'
    );

    res.send(excelBuffer);
  } catch (error) {
    console.error('Error converting attendance to Excel:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// =================================================== END My Student Data =================================================== //


// =================================================== Whats App =================================================== //



const whatsApp_get = (req,res)=>{
  res.render('teacher/whatsApp', { title: 'whatsApp', path: req.path });
}


const sendGradeMessages = async (req, res) => {
  const {
    phoneCloumnName,
    gradeCloumnName,
    nameCloumnName,
    dataToSend,
    quizName,
    maxGrade,
    examEntryCloumnName,
    courseName,
    isOnlineQuiz,
  } = req.body;

  let successCount = 0;
  let errorCount = 0;
  let errors = [];
  
  // Emit initial status
  req.io.emit('sendingMessages', {
    nMessages: 0,
    totalMessages: dataToSend.length,
    successCount: 0,
    errorCount: 0,
    status: 'starting'
  });

  try {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        for (let i = 0; i < dataToSend.length; i++) {
      const student = dataToSend[i];
      const grade = student[gradeCloumnName] ?? 0;
      const phone = student[phoneCloumnName];
      const name = student[nameCloumnName];
      
      // Check if student entered the exam (default to 1 if not specified)
      const examEntry = examEntryCloumnName ? (student[examEntryCloumnName] ?? 1) : 1;

      console.log(`Processing ${i + 1}/${dataToSend.length}: ${name} (${phone})`);

      let message = '';
      
      if (isOnlineQuiz) {
        // Online Quiz format
        if (examEntry === 0) {
          // Student did not enter the exam
          message = `
السلام عليكم 🙏🏻
مع حضرتك Assistant Miss Mayada 

لقد قام الطالب
*${name}*
${courseName || ''}
بعدم حل امتحان اليوم❌
*${quizName}*
          `;
        } else {
          // Student entered the exam (default case)
          message = `
السلام عليكم 🙏🏻
مع حضرتك Assistant Miss Mayada 

لقد قام الطالب
*${name}*
${courseName || ''}
بحل امتحان حصة اليوم✅
*${quizName}*
وحصل على درجه ${grade}/${maxGrade}
          `;
        }
      } else {
        // Regular exam format
        if (examEntry === 0) {
          // Student did not enter the exam
          message = `
السلام عليكم 
مع حضرتك Assistant Miss Mayada EST/ACT/SAT Teacher 
برجاء العلم ان الطالب *${name}* ${courseName ? `(${courseName})` : ''} لم يدخل الامتحان (*${quizName}*)
          `;
        } else {
          // Student entered the exam (default case)
          message = `
السلام عليكم 
مع حضرتك Assistant Miss Mayada EST/ACT/SAT Teacher 
برجاء العلم ان تم حصول الطالب *${name}* ${courseName ? `(${courseName})` : ''} على درجة (*${grade}*) من (*${maxGrade}*) في (*${quizName}*) 
          `;
        }
      }

      try {
        const result = await sendWappiMessage(message, phone, req.userData.phone);
        successCount++;
        
        // Emit progress update
        req.io.emit('sendingMessages', {
          nMessages: i + 1,
          totalMessages: dataToSend.length,
          successCount,
          errorCount,
          status: 'progress',
          currentStudent: name,
          lastResult: 'success'
        });
        
        console.log(`✅ Success: Message sent to ${name}`);
        
      } catch (err) {
        errorCount++;
        const errorInfo = {
          student: name,
          phone: phone,
          error: err.message,
          timestamp: new Date().toISOString()
        };
        errors.push(errorInfo);
        
        // Emit progress update with error
        req.io.emit('sendingMessages', {
          nMessages: i + 1,
          totalMessages: dataToSend.length,
          successCount,
          errorCount,
          status: 'progress',
          currentStudent: name,
          lastResult: 'error',
          lastError: err.message
        });
        
        console.error(`❌ Error sending message to ${name}:`, err.message);
      }

      // Introduce a random delay between 5 and 8 seconds
      const randomDelay = Math.floor(Math.random() * (8 - 5 + 1) + 5) * 1000;
      console.log(
        `Delaying for ${randomDelay / 1000} seconds before sending the next message.`
      );
      await delay(randomDelay);
    }

    // Emit final status
    req.io.emit('sendingMessages', {
      nMessages: dataToSend.length,
      totalMessages: dataToSend.length,
      successCount,
      errorCount,
      status: 'completed',
      errors: errors
    });

    if (errorCount > 0) {
      res.status(207).json({ 
        message: `Messages completed with ${errorCount} errors`,
        successCount,
        errorCount,
        errors,
        totalMessages: dataToSend.length
      });
    } else {
      res.status(200).json({ 
        message: 'All messages sent successfully',
        successCount,
        errorCount: 0,
        totalMessages: dataToSend.length
      });
    }
    
  } catch (error) {
    console.error('Critical error in sendGradeMessages:', error);
    
    // Emit error status
    req.io.emit('sendingMessages', {
      nMessages: 0,
      totalMessages: dataToSend.length,
      successCount,
      errorCount,
      status: 'failed',
      error: error.message
    });
    
    res.status(500).json({ 
      message: 'Critical error occurred while sending messages',
      error: error.message,
      successCount,
      errorCount,
      totalMessages: dataToSend.length
    });
  }
};


const sendMessages = async (req, res) => {
  const { phoneCloumnName, nameCloumnName, dataToSend, HWCloumnName, courseName } =
    req.body;

  let successCount = 0;
  let errorCount = 0;
  let errors = [];
  
  // Emit initial status
  req.io.emit('sendingMessages', {
    nMessages: 0,
    totalMessages: dataToSend.length,
    successCount: 0,
    errorCount: 0,
    status: 'starting'
  });

  try {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let i = 0; i < dataToSend.length; i++) {
      const student = dataToSend[i];
      let msg = '';
      const courseNameText = courseName || 'Basics Course';
      
      if (!student[HWCloumnName]) {
        msg = `بعدم حل واجب حصة اليوم❌`;
      } else {
        msg = `بحل واجب حصة اليوم✅`;
      }

      let theMessage = `السلام عليكم 🙏🏻
مع حضرتك Assistant Miss Mayada 

لقد قام الطالب
${student[nameCloumnName]}
${courseNameText}
${msg}`;

      try {
        const result = await sendWappiMessage(theMessage, student[phoneCloumnName], req.userData.phone);
        successCount++;
        
        // Emit progress update
        req.io.emit('sendingMessages', {
          nMessages: i + 1,
          totalMessages: dataToSend.length,
          successCount,
          errorCount,
          status: 'progress',
          currentStudent: student[nameCloumnName],
          lastResult: 'success'
        });
        
        console.log(`✅ Success: Message sent to ${student[nameCloumnName]}`);
        
      } catch (err) {
        errorCount++;
        const errorInfo = {
          student: student[nameCloumnName],
          phone: student[phoneCloumnName],
          error: err.message,
          timestamp: new Date().toISOString()
        };
        errors.push(errorInfo);
        
        // Emit progress update with error
        req.io.emit('sendingMessages', {
          nMessages: i + 1,
          totalMessages: dataToSend.length,
          successCount,
          errorCount,
          status: 'progress',
          currentStudent: student[nameCloumnName],
          lastResult: 'error',
          lastError: err.message
        });
        
        console.error(`❌ Error sending message to ${student[nameCloumnName]}:`, err.message);
      }

      // Introduce a random delay between 5 and 8 seconds
      const randomDelay = Math.floor(Math.random() * (8 - 5 + 1) + 5) * 1000;
      console.log(
        `Delaying for ${randomDelay / 1000} seconds before sending the next message.`
      );
      await delay(randomDelay);
    }

    // Emit final status
    req.io.emit('sendingMessages', {
      nMessages: dataToSend.length,
      totalMessages: dataToSend.length,
      successCount,
      errorCount,
      status: 'completed',
      errors: errors
    });

    if (errorCount > 0) {
      res.status(207).json({ 
        message: `Messages completed with ${errorCount} errors`,
        successCount,
        errorCount,
        errors,
        totalMessages: dataToSend.length
      });
    } else {
      res.status(200).json({ 
        message: 'All messages sent successfully',
        successCount,
        errorCount: 0,
        totalMessages: dataToSend.length
      });
    }
    
  } catch (error) {
    console.error('Critical error in sendMessages:', error);
    
    // Emit error status
    req.io.emit('sendingMessages', {
      nMessages: 0,
      totalMessages: dataToSend.length,
      successCount,
      errorCount,
      status: 'failed',
      error: error.message
    });
    
    res.status(500).json({ 
      message: 'Critical error occurred while sending messages',
      error: error.message,
      successCount,
      errorCount,
      totalMessages: dataToSend.length
    });
  }
};


// General custom messages from Excel
const sendCustomMessages = async (req, res) => {
  const {
    recipientType, // 'parents' | 'students' | 'both'
    parentPhoneColumnName,
    studentPhoneColumnName,
    nameCloumnName,
    message,
    dataToSend,
  } = req.body;

  let successCount = 0;
  let errorCount = 0;
  let errors = [];
  let totalMessages = 0;
  
  // Calculate total messages to be sent
  for (const row of dataToSend) {
    const targets = [];
    if (recipientType === 'parents' || recipientType === 'both') {
      const parentPhone = parentPhoneColumnName ? row[parentPhoneColumnName] : undefined;
      if (parentPhone) targets.push(parentPhone);
    }
    if (recipientType === 'students' || recipientType === 'both') {
      const studentPhone = studentPhoneColumnName ? row[studentPhoneColumnName] : undefined;
      if (studentPhone) targets.push(studentPhone);
    }
    totalMessages += targets.length;
  }
  
  // Emit initial status
  req.io.emit('sendingMessages', {
    nMessages: 0,
    totalMessages: totalMessages,
    successCount: 0,
    errorCount: 0,
    status: 'starting'
  });

  try {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let messageIndex = 0;

    for (const row of dataToSend) {
      const name = nameCloumnName ? row[nameCloumnName] : 'Unknown';
      const baseMessage = message || '';

      const targets = [];
      if (recipientType === 'parents' || recipientType === 'both') {
        const parentPhone = parentPhoneColumnName ? row[parentPhoneColumnName] : undefined;
        if (parentPhone) targets.push({ phone: parentPhone, type: 'parent' });
      }
      if (recipientType === 'students' || recipientType === 'both') {
        const studentPhone = studentPhoneColumnName ? row[studentPhoneColumnName] : undefined;
        if (studentPhone) targets.push({ phone: studentPhone, type: 'student' });
      }

      for (const target of targets) {
        try {
          // Personalize header based on recipient type
          const header = target.type === 'parent'
            ? `هذه الرساله موجه لولي امر الطالب ${name}`
            : `عزيزي الطالب ${name}`;
          const personalizedText = `${header}\n\n${baseMessage}`;

          await sendWappiMessage(personalizedText, target.phone, req.userData.phone);
          successCount++;
          messageIndex++;
          
          // Emit progress update
          req.io.emit('sendingMessages', {
            nMessages: messageIndex,
            totalMessages: totalMessages,
            successCount,
            errorCount,
            status: 'progress',
            currentStudent: name,
            lastResult: 'success',
            targetType: target.type
          });
          
          console.log(`✅ Success: Message sent to ${name} (${target.type})`);
          
        } catch (err) {
          errorCount++;
          messageIndex++;
          const errorInfo = {
            student: name,
            phone: target.phone,
            type: target.type,
            error: err.message,
            timestamp: new Date().toISOString()
          };
          errors.push(errorInfo);
          
          // Emit progress update with error
          req.io.emit('sendingMessages', {
            nMessages: messageIndex,
            totalMessages: totalMessages,
            successCount,
            errorCount,
            status: 'progress',
            currentStudent: name,
            lastResult: 'error',
            lastError: err.message,
            targetType: target.type
          });
          
          console.error(`❌ Error sending message to ${name} (${target.type}):`, err.message);
        }

        const randomDelay = Math.floor(Math.random() * (5 - 1 + 1) + 1) * 1000;
        await delay(randomDelay);
      }
    }

    // Emit final status
    req.io.emit('sendingMessages', {
      nMessages: totalMessages,
      totalMessages: totalMessages,
      successCount,
      errorCount,
      status: 'completed',
      errors: errors
    });

    if (errorCount > 0) {
      res.status(207).json({ 
        message: `Messages completed with ${errorCount} errors`,
        successCount,
        errorCount,
        errors,
        totalMessages: totalMessages
      });
    } else {
      res.status(200).json({ 
        message: 'All messages sent successfully',
        successCount,
        errorCount: 0,
        totalMessages: totalMessages
      });
    }
    
  } catch (error) {
    console.error('Critical error in sendCustomMessages:', error);
    
    // Emit error status
    req.io.emit('sendingMessages', {
      nMessages: 0,
      totalMessages: totalMessages,
      successCount,
      errorCount,
      status: 'failed',
      error: error.message
    });
    
    res.status(500).json({ 
      message: 'Critical error occurred while sending messages',
      error: error.message,
      successCount,
      errorCount,
      totalMessages: totalMessages
    });
  }
};



// =================================================== END Whats App =================================================== //



// =================================================== Whats app 2 =================================================== //


const whatsApp2_get = (req, res) => {
  res.render('teacher/whatsApp2', { title: 'whatsApp2', path: req.path });
}

const getDataStudentInWhatsApp = async (req, res) => {
  const {centerName,Grade,gradeType,groupTime} = req.query 
  try {
    const group = await Group.findOne({CenterName:centerName,Grade,gradeType,GroupTime:groupTime}).populate('students')
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }
    const students = group.students;
    return res.status(200).json({ students });
  }
  catch (error) {
    console.error('Error fetching attendees:', error);
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }

}

const submitData = async (req, res) => {
  const { data, option, quizName, maxGrade, instanceID } = req.body;
  let successCount = 0;
  let errorCount = 0;
  let errors = [];
  
  // Emit initial status
  req.io.emit('sendingMessages', {
    nMessages: 0,
    totalMessages: data.length,
    successCount: 0,
    errorCount: 0,
    status: 'starting'
  });

  try {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let i = 0; i < data.length; i++) {
      const student = data[i];
      let theMessage = '';
      
      if (option === 'HWStatus') {
        let msg = '';
        if (student['hwStatus'] == 'no') {
          msg = `لم يقم الطالب ${student['studentName']} بحل واجب حصة اليوم`;
        } else {
          msg = `لقد قام الطالب ${student['studentName']} بحل واجب حصة اليوم`;
        }
        theMessage = `
السلام عليكم 
مع حضرتك Assistant Miss Mayada EST/ACT/SAT Teacher 
${msg}
`;
      } else if (option === 'gradeMsg') {
        theMessage = `
السلام عليكم
مع حضرتك Assistant Miss Mayada EST/ACT/SAT Teacher
برجاء العلم ان تم حصول الطالب ${student['studentName']} على درجة (${student['grade']? student['grade'] : 'لم يحضر' }) من (${maxGrade}) في (${quizName})
`;
      }

      try {
        await sendWappiMessage(theMessage, student['parentPhone'], req.userData.phone);
        successCount++;
        
        // Emit progress update
        req.io.emit('sendingMessages', {
          nMessages: i + 1,
          totalMessages: data.length,
          successCount,
          errorCount,
          status: 'progress',
          currentStudent: student['studentName'],
          lastResult: 'success'
        });
        
        console.log(`✅ Success: Message sent to ${student['studentName']}`);
        
      } catch (err) {
        errorCount++;
        const errorInfo = {
          student: student['studentName'],
          phone: student['parentPhone'],
          error: err.message,
          timestamp: new Date().toISOString()
        };
        errors.push(errorInfo);
        
        // Emit progress update with error
        req.io.emit('sendingMessages', {
          nMessages: i + 1,
          totalMessages: data.length,
          successCount,
          errorCount,
          status: 'progress',
          currentStudent: student['studentName'],
          lastResult: 'error',
          lastError: err.message
        });
        
        console.error(`❌ Error sending message to ${student['studentName']}:`, err.message);
      }

      // Introduce a random delay between 5 and 8 seconds
      const randomDelay = Math.floor(Math.random() * (8 - 5 + 1) + 5) * 1000;
      console.log(
        `Delaying for ${randomDelay / 1000} seconds before sending the next message.`
      );
      await delay(randomDelay);
    }

    // Emit final status
    req.io.emit('sendingMessages', {
      nMessages: data.length,
      totalMessages: data.length,
      successCount,
      errorCount,
      status: 'completed',
      errors: errors
    });

    if (errorCount > 0) {
      res.status(207).json({ 
        message: `Messages completed with ${errorCount} errors`,
        successCount,
        errorCount,
        errors,
        totalMessages: data.length
      });
    } else {
      res.status(200).json({ 
        message: 'All messages sent successfully',
        successCount,
        errorCount: 0,
        totalMessages: data.length
      });
    }
    
  } catch (error) {
    console.error('Critical error in submitData:', error);
    
    // Emit error status
    req.io.emit('sendingMessages', {
      nMessages: 0,
      totalMessages: data.length,
      successCount,
      errorCount,
      status: 'failed',
      error: error.message
    });
    
    res.status(500).json({ 
      message: 'Critical error occurred while sending messages',
      error: error.message,
      successCount,
      errorCount,
      totalMessages: data.length
    });
  }
};


const sendAttendanceMessages = async (req, res) => {
  const { 
    courseName, 
    phoneColumnName, 
    nameColumnName, 
    attendanceValueColumnName, 
    attendanceTimeColumnName, 
    cameraColumnName,
    totalSessionTime, 
    dataToSend 
  } = req.body;

  let successCount = 0;
  let errorCount = 0;
  let errors = [];
  
  // Emit initial status
  req.io.emit('sendingMessages', {
    nMessages: 0,
    totalMessages: dataToSend.length,
    successCount: 0,
    errorCount: 0,
    status: 'starting'
  });

  try {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let i = 0; i < dataToSend.length; i++) {
      const student = dataToSend[i];
      const studentName = student[nameColumnName];
      const phoneNumber = student[phoneColumnName];
      const attendanceValue = student[attendanceValueColumnName];
      const attendanceTime = attendanceTimeColumnName ? student[attendanceTimeColumnName] : null;
      const cameraStatus = cameraColumnName ? student[cameraColumnName] : null;
      
      let message = '';
      
      // Determine message based on attendance value
      if (attendanceValue == 1) {
        // Student attended
        let cameraText = '';
        if (cameraStatus == 1) {
          cameraText = '\n\nمع العلم أن الطالب قام بفتح الكاميرا خلال الحصة.';
        } else if (cameraStatus == 0) {
          cameraText = '\n\nمع العلم أن الطالب لم يقم بفتح الكاميرا خلال الحصة.';
        }
        
        if (attendanceTime && attendanceTime > 0 && attendanceTime < totalSessionTime) {
          // Partial attendance
          message = `السلام عليكم 🙏🏻
مع حضرتك Assistant Miss Mayada 

لقد قام الطالب
${studentName}
${courseName}
بحضور حصة اليوم✅

مع العلم أن الطالب حضر فقط ${attendanceTime} دقيقة من أصل ${totalSessionTime} دقيقة مدة الحصة.${cameraText}`;
        } else {
          // Full attendance
          message = `السلام عليكم 🙏🏻
مع حضرتك Assistant Miss Mayada 

لقد قام الطالب
${studentName}
${courseName}
بحضور حصة اليوم✅${cameraText}`;
        }
      } else {
        // Student absent
        message = `السلام عليكم 🙏🏻
مع حضرتك Assistant Miss Mayada 

لقد قام الطالب
${studentName}
${courseName}
بعدم حضور حصة اليوم❌`;
      }

      try {
        await sendWasenderMessage(message, phoneNumber, req.userData.phone);
        successCount++;
        
        // Emit progress update
        req.io.emit('sendingMessages', {
          nMessages: i + 1,
          totalMessages: dataToSend.length,
          successCount,
          errorCount,
          status: 'progress',
          currentStudent: studentName,
          lastResult: 'success'
        });
        
        console.log(`✅ Success: Attendance message sent to ${studentName}`);
        
      } catch (err) {
        errorCount++;
        const errorInfo = {
          student: studentName,
          phone: phoneNumber,
          error: err.message,
          timestamp: new Date().toISOString()
        };
        errors.push(errorInfo);
        
        // Emit progress update with error
        req.io.emit('sendingMessages', {
          nMessages: i + 1,
          totalMessages: dataToSend.length,
          successCount,
          errorCount,
          status: 'progress',
          currentStudent: studentName,
          lastResult: 'error',
          lastError: err.message
        });
        
        console.error(`❌ Error sending attendance message to ${studentName}:`, err.message);
      }

      // Introduce a random delay between 5 and 8 seconds
      const randomDelay = Math.floor(Math.random() * (8 - 5 + 1) + 5) * 1000;
      console.log(
        `Delaying for ${randomDelay / 1000} seconds before sending the next message.`
      );
      await delay(randomDelay);
    }

    // Emit final status
    req.io.emit('sendingMessages', {
      nMessages: dataToSend.length,
      totalMessages: dataToSend.length,
      successCount,
      errorCount,
      status: 'completed',
      errors: errors
    });

    if (errorCount > 0) {
      res.status(207).json({
        message: `Messages sent with ${errorCount} errors`,
        successCount,
        errorCount,
        totalMessages: dataToSend.length,
        errors: errors
      });
    } else {
      res.json({
        message: 'All attendance messages sent successfully',
        successCount,
        errorCount: 0,
        totalMessages: dataToSend.length
      });
    }

  } catch (error) {
    console.error('Critical error in sendAttendanceMessages:', error);
    
    // Emit error status
    req.io.emit('sendingMessages', {
      status: 'failed',
      error: error.message,
      successCount,
      errorCount,
      totalMessages: dataToSend.length
    });
    
    res.status(500).json({ 
      message: 'Critical error occurred while sending attendance messages',
      error: error.message,
      successCount,
      errorCount,
      totalMessages: dataToSend.length
    });
  }
};

// Collection messages (dynamic multi-date attendance/HW/quiz report)
const sendCollectionMessages = async (req, res) => {
  const {
    studentNameColumn,
    parentPhoneColumn,
    // Generic simple prefixes (legacy fallback)
    datePrefix,
    attendancePrefix,
    hwPrefix,
    quizPrefix,
    // Structured prefixes (recommended, like other parts)
    datePrefixStructured,            // e.g., 'Date'
    attendanceValuePrefix,           // e.g., 'AttendanceValue' -> 1/0
    attendanceTimePrefix,            // e.g., 'AttendanceTime' -> minutes attended
    cameraPrefix,                    // e.g., 'Camera' -> 1/0
    hwStatusPrefix,                  // e.g., 'HWStatus' -> yes/no/1/0
    quizNamePrefix,                  // e.g., 'QuizName'
    gradePrefix,                     // e.g., 'Grade'
    maxGradePrefix,                  // e.g., 'MaxGrade'
    examEntryPrefix,                 // e.g., 'ExamEntry' -> 1/0
    totalSessionTime,                // number (minutes) to compare partial attendance
    headerIntro,
    title,
    dataToSend
  } = req.body;

  let successCount = 0;
  let errorCount = 0;
  let errors = [];

  // Emit initial status
  if (req.io) {
    req.io.emit('sendingMessages', {
      nMessages: 0,
      totalMessages: Array.isArray(dataToSend) ? dataToSend.length : 0,
      successCount: 0,
      errorCount: 0,
      status: 'starting'
    });
  }

  try {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // Helper: build segments for a row based on prefixes and numeric suffixes
    const buildSegments = (row) => {
      const keys = Object.keys(row || {});
      const indexSet = new Set();

      const collectIndex = (prefix) => {
        if (!prefix) return;
        keys.forEach((k) => {
          if (k.startsWith(prefix)) {
            const suffix = k.slice(prefix.length);
            const idx = suffix && /^\d+$/.test(suffix) ? parseInt(suffix, 10) : 1;
            indexSet.add(idx);
          }
        });
      };

      // legacy simple prefixes
      collectIndex(datePrefix);
      collectIndex(attendancePrefix);
      collectIndex(hwPrefix);
      collectIndex(quizPrefix);
      // structured prefixes
      collectIndex(datePrefixStructured);
      collectIndex(attendanceValuePrefix);
      collectIndex(attendanceTimePrefix);
      collectIndex(cameraPrefix);
      collectIndex(hwStatusPrefix);
      collectIndex(quizNamePrefix);
      collectIndex(gradePrefix);
      collectIndex(maxGradePrefix);
      collectIndex(examEntryPrefix);

      let indices = Array.from(indexSet);
      indices.sort((a, b) => a - b);
      if (indices.length === 0) indices = [1];

      const getVal = (prefix, idx) => {
        if (!prefix) return undefined;
        const keyWithIndex = `${prefix}${idx}`;
        if (Object.prototype.hasOwnProperty.call(row, keyWithIndex)) return row[keyWithIndex];
        // fallback to plain prefix (no index) for first segment
        if (idx === 1 && Object.prototype.hasOwnProperty.call(row, prefix)) return row[prefix];
        return undefined;
      };

      return indices.map((i) => ({
        // legacy simple
        date: getVal(datePrefix, i) ?? getVal(datePrefixStructured, i),
        attendance: getVal(attendancePrefix, i),
        hw: getVal(hwPrefix, i),
        quiz: getVal(quizPrefix, i),
        // structured
        attendanceValue: getVal(attendanceValuePrefix, i),
        attendanceTime: getVal(attendanceTimePrefix, i),
        camera: getVal(cameraPrefix, i),
        hwStatus: getVal(hwStatusPrefix, i),
        quizName: getVal(quizNamePrefix, i),
        grade: getVal(gradePrefix, i),
        maxGrade: getVal(maxGradePrefix, i),
        examEntry: getVal(examEntryPrefix, i)
      }));
    };

    for (let i = 0; i < dataToSend.length; i++) {
      const row = dataToSend[i];
      const studentName = row[studentNameColumn] || 'Unknown';
      const parentPhone = row[parentPhoneColumn];

      // Compose message
      const segments = buildSegments(row);

      let message = '';
      message += 'السلام عليكم 🙏🏻\n';
      message += 'مع حضرتك Assistant Miss Mayada\n\n';
      message += `${title || 'تقرير الطالب'}\n`;
      message += `${studentName}\n`;
      if (headerIntro) message += `${headerIntro}\n`;
      message += '\n';

      segments.forEach((seg) => {
        // If using structured fields, format like the other parts; otherwise, fallback to legacy simple text
        const usingStructured =
          seg.attendanceValue !== undefined ||
          seg.attendanceTime !== undefined ||
          seg.camera !== undefined ||
          seg.hwStatus !== undefined ||
          seg.quizName !== undefined ||
          seg.grade !== undefined ||
          seg.maxGrade !== undefined ||
          seg.examEntry !== undefined;

        if (!seg.date && !usingStructured && !seg.attendance && !seg.hw && !seg.quiz) return;
        if (seg.date) message += `التاريخ ${seg.date}\n`;

        if (usingStructured) {
          // Attendance
          if (seg.attendanceValue == 1) {
            message += `الحضور: تم الحضور✅\n`;
            
            // Always add time info if provided
            if (seg.attendanceTime && Number(seg.attendanceTime) > 0) {
            
                message += `مع العلم أن الطالب حضر ${seg.attendanceTime} دقيقة من أصل 120 دقيقة مدة الحصة.\n`;
     
        
            }
            // Camera info on a separate line if provided (only if camera value is explicitly set)
            if (seg.camera !== undefined && seg.camera !== '') {
              if (seg.camera == 1) {
                message += `مع العلم أن الطالب قام بفتح الكاميرا خلال الحصة.\n`;
              } else if (seg.camera == 0) {
                message += `مع العلم أن الطالب لم يقم بفتح الكاميرا خلال الحصة.\n`;
              }
            }
          } else if (seg.attendanceValue == 0) {
            message += `الحضور: لم يتم الحضور❌\n`;
          }

          // Homework (prefer numeric 1/0; still compatible with old values)
          if (seg.hwStatus !== undefined && seg.hwStatus !== '') {
            const asString = String(seg.hwStatus).trim().toLowerCase();
            if (asString === '1' || asString === 'yes' || asString === 'تم' || asString === 'نعم' || asString === 'true') {
              message += `الواجب: تم حل الواجب✅\n`;
            } else if (asString === '0' || asString === 'no' || asString === 'لم' || asString === 'لا' || asString === 'false') {
              message += `الواجب: لم يتم حل الواجب❌\n`;
            } else {
              message += `الواجب: ${seg.hwStatus}\n`;
            }
          } else {
            // If HWStatus is empty, show "no homework"
            message += `الواجب: لم يكن هناك واجب\n`;
          }

          // Quiz
          if (seg.examEntry !== undefined && seg.examEntry !== '' && seg.examEntry == 0) {
            message += `الامتحان: لم يدخل الامتحان❌\n`;
          } else if (seg.quizName || seg.grade || seg.maxGrade) {
            let quizLine = 'الامتحان: ';
            if (seg.quizName) quizLine += `${seg.quizName}`;
            if (seg.grade !== undefined && seg.maxGrade !== undefined) {
              quizLine += (seg.quizName ? ' | ' : '') + `الدرجة: ${seg.grade}/${seg.maxGrade}`;
            }
            message += quizLine + '\n';
          } else {
            // If no quiz data provided, show "no quiz"
            message += `الامتحان: لم يكن هناك امتحان\n`;
          }
        } else {
          // Legacy fallback formatting
          if (seg.attendance !== undefined && seg.attendance !== null && seg.attendance !== '') {
            // If legacy sheet also provides attendanceTime, include partial attendance phrasing
            if (
              seg.attendanceTime &&
              totalSessionTime &&
              Number(seg.attendanceTime) > 0 &&
              Number(seg.attendanceTime) < Number(totalSessionTime)
            ) {
              message += `الحضور: ${seg.attendance}\nمع العلم أن الطالب حضر فقط ${seg.attendanceTime} دقيقة من أصل ${totalSessionTime} دقيقة مدة الحصة.\n`;
            } else {
              message += `الحضور: ${seg.attendance}\n`;
            }
          }
          if (seg.hw !== undefined && seg.hw !== null && seg.hw !== '') {
            message += `الواجب: ${seg.hw}\n`;
          }
          if (seg.quiz !== undefined && seg.quiz !== null && seg.quiz !== '') {
            message += `الامتحان: ${seg.quiz}\n`;
          }
        }

        message += '\n';
      });

      try {
        await sendWappiMessage(message, parentPhone, req.userData.phone);
        successCount++;
        if (req.io) {
          req.io.emit('sendingMessages', {
            nMessages: i + 1,
            totalMessages: dataToSend.length,
            successCount,
            errorCount,
            status: 'progress',
            currentStudent: studentName,
            lastResult: 'success'
          });
        }
      } catch (err) {
        errorCount++;
        const errorInfo = {
          student: studentName,
          phone: parentPhone,
          error: err.message,
          timestamp: new Date().toISOString()
        };
        errors.push(errorInfo);
        if (req.io) {
          req.io.emit('sendingMessages', {
            nMessages: i + 1,
            totalMessages: dataToSend.length,
            successCount,
            errorCount,
            status: 'progress',
            currentStudent: studentName,
            lastResult: 'error',
            lastError: err.message
          });
        }
      }

      // Changed delay to be between 6-8 seconds
      const messageDelay = Math.floor(Math.random() * (8000 - 6000 + 1) + 6000);
      await delay(messageDelay);
    }

    if (req.io) {
      req.io.emit('sendingMessages', {
        nMessages: dataToSend.length,
        totalMessages: dataToSend.length,
        successCount,
        errorCount,
        status: 'completed',
        errors: errors
      });
    }

    if (errorCount > 0) {
      return res.status(207).json({
        message: `Messages completed with ${errorCount} errors`,
        successCount,
        errorCount,
        errors,
        totalMessages: dataToSend.length
      });
    }

    return res.status(200).json({
      message: 'All collection messages sent successfully',
      successCount,
      errorCount: 0,
      totalMessages: dataToSend.length
    });
  } catch (error) {
    console.error('Critical error in sendCollectionMessages:', error);
    if (req.io) {
      req.io.emit('sendingMessages', {
        nMessages: 0,
        totalMessages: Array.isArray(dataToSend) ? dataToSend.length : 0,
        successCount,
        errorCount,
        status: 'failed',
        error: error.message
      });
    }
    return res.status(500).json({
      message: 'Critical error occurred while sending collection messages',
      error: error.message,
      successCount,
      errorCount,
      totalMessages: Array.isArray(dataToSend) ? dataToSend.length : 0
    });
  }
};

// Generate sample Excel for collection messages
const collectionSampleExcel = async (req, res) => {
  try {
    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('Collection Sample');

    // Headers
    const headers = [
      'studentName',
      'parentPhone',
      // First segment (structured prefixes without suffix for segment 1)
      'Date',
      'AttendanceValue',
      'AttendanceTime',
      'Camera',
      'HWStatus',
      'ExamEntry',
      'QuizName',
      'Grade',
      'MaxGrade',
      // Second segment
      'Date2',
      'AttendanceValue2',
      'AttendanceTime2',
      'Camera2',
      'HWStatus2',
      'ExamEntry2',
      'QuizName2',
      'Grade2',
      'MaxGrade2',
      // Third segment
      'Date3',
      'AttendanceValue3',
      'AttendanceTime3',
      'Camera3',
      'HWStatus3',
      'ExamEntry3',
      'QuizName3',
      'Grade3',
      'MaxGrade3'
    ];
    worksheet.addRow(headers);

    // Case 1: Present with partial time, camera off, HW done, no exam
    worksheet.addRow([
      'Lamis Yasser Mohamed',
      '01200000000',
      // seg1
      '17/9',        // Date
      1,             // AttendanceValue: present
      70,            // AttendanceTime (minutes)
      0,             // Camera: not opened
      1,             // HWStatus: done
      '',            // ExamEntry: empty (no exam)
      '',            // QuizName
      '',            // Grade
      '',            // MaxGrade
      // seg2
      '20/9',        // Date2
      0,             // AttendanceValue2: absent
      '',            // AttendanceTime2
      '',            // Camera2
      1,             // HWStatus2: done
      1,             // ExamEntry2: entered
      'Vocab Quiz 19/9', // QuizName2
      5,             // Grade2
      10,            // MaxGrade2
      // seg3
      '25/9',        // Date3
      1,             // AttendanceValue3: present
      '',            // AttendanceTime3
      '',            // Camera3
      0,             // HWStatus3: not done
      '',            // ExamEntry3: empty (no exam)
      '',            // QuizName3
      '',            // Grade3
      ''             // MaxGrade3
    ]);

    // Case 2: Present with camera, no HW, quiz with score; then present with HW, no exam; then empty
    worksheet.addRow([
      'Omar Ali',
      '01211111111',
      // seg1
      '10/9',
      1,      // present
      '',
      1,      // camera opened
      '',     // HWStatus: empty (no homework)
      1,      // ExamEntry
      'Quiz Unit 1',
      9,
      10,
      // seg2
      '12/9',
      1,      // present
      '',
      '',     // camera: empty (not required)
      1,      // HWStatus: done
      '',     // ExamEntry: empty (no exam)
      '',
      '',
      '',
      // seg3 empty
      '15/9',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    ]);

    // Case 3: Date only, then absent with no exam, then present with quiz
    worksheet.addRow([
      'Sara Mohamed',
      '01222222222',
      // seg1
      '01/10',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      // seg2
      '05/10',
      0,   // absent
      '',
      '',
      '',
      0,   // no exam
      '',
      '',
      '',
      // seg3
      '08/10',
      1,   // present
      '',
      '',
      '',
      1,   // entered exam
      'Quiz Unit 2',
      7,
      10
    ]);

    // Case 4: Present with full time, camera on, no HW, no exam
    worksheet.addRow([
      'Ahmed Hassan',
      '01233333333',
      // seg1
      '03/10',
      1,   // present
      120, // full time
      1,   // camera opened
      '',  // HWStatus: empty (no homework)
      '',  // ExamEntry: empty (no exam)
      '',
      '',
      '',
      // seg2
      '05/10',
      1,   // present
      90,  // partial time
      '',  // camera: empty (not required)
      0,   // HWStatus: not done
      1,   // ExamEntry: entered
      'Math Quiz',
      8,
      10,
      // seg3
      '07/10',
      0,   // absent
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    ]);

    // Column widths for readability
    worksheet.columns = headers.map(() => ({ width: 22 }));

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Collection_Message_Sample.xlsx');
    res.send(buffer);
  } catch (error) {
    console.error('Error generating sample Excel:', error);
    res.status(500).json({ success: false, message: 'Failed to generate sample Excel', error: error.message });
  }
};

// =================================================== END Whats app 2 =================================================== //

// =================================================== Convert Group =================================================== //


const convertGroup_get = (req, res) => {
  res.render('teacher/convertGroup', { title: 'convertGroup', path: req.path });
}

const getDataToTransferring = async (req, res) => {
  const {Code} = req.params;

  try {
    const student = await User.findOne({
      $or: [{ cardId: Code }, { Code: +Code }],
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const groups = await Group.find({ Grade: student.Grade, CenterName: student.centerName, gradeType: student.gradeType });

    if (!groups) {
      return res.status(404).json({ message: 'No groups found for this student' });
    }

    return res.status(200).json(  student  );
  }
  catch (error) {
    console.error('Error fetching groups:', error);
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
}

const transferStudent = async (req, res) => {
  const {  centerName, Grade, gradeType, groupTime } = req.body;
  const {Code} = req.params;
  console.log(req.body)
  try {
    const student = await User.findOne({
      $or: [{ cardId: Code }, { Code: +Code }],
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const group = await Group.findOne({
      Grade,
      CenterName: centerName,
      GroupTime: groupTime,
      gradeType,
    });

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Remove the student from any previous group
    await Group.updateMany(
      { students: student._id },
      { $pull: { students: student._id } }
    );

    // Check if the student is already in the group
    if (group.students.includes(student._id)) {
      return res.status(400).json({ message: 'Student is already in the group' });
    }


    // Update the student's group info
    student.centerName = centerName;
    student.Grade = Grade;
    student.gradeType = gradeType;
    student.groupTime = groupTime;
    // Save with validation disabled to avoid required field errors
    try {
      await student.save({ validateBeforeSave: false });
    } catch (saveError) {
      console.warn(`Error saving student ${student.Username} (ID: ${student._id}):`, saveError.message);
      return res.status(500).json({ message: 'Error updating student data' });
    }

    // Transfer the student to the new group
    group.students.push(student._id);
    await group.save();

    return res.status(200).json({ message: 'Student transferred successfully' });
  } catch (error) {
    console.error('Error transferring student:', error);
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
};


// =================================================== Connect WhatsApp =================================================== //


const connectWhatsapp_get = (req, res) => {
  res.render('teacher/connectWhatsapp', { title: 'Connect WhatsApp', path: req.path });
};

const createInstance = async (req, res) => {
  const { phoneNumber, name } = req.body;
  try {
    console.log(`Creating Wasender session (phone: ${phoneNumber || '-'}, name: ${name || '-'})`);
    
    // Create session with proper payload including required fields
    const sessionPayload = {
      name: name || 'WhatsApp Session',
      phone_number: phoneNumber || null,
      account_protection: true,  // Required field
      log_messages: true,        // Required field
      webhook_enabled: false,
      webhook_events: []
    };
    
    const resp = await wasender.createSession(sessionPayload);
    
    if (!resp.success) {
      return res.status(400).json(resp);
    }
    
    // Use the created session data from API response
    const created = resp.data;
    
    // If API doesn't return session data, create a fallback
    if (!created || !created.id) {
      const fallbackInstance = {
        id: `WA${Date.now()}`,
        name: name || 'WhatsApp Session',
        phone_number: phoneNumber || '-',
        status: 'disconnected',
        account_protection: true,
        log_messages: true,
        webhook_url: null,
        webhook_enabled: false,
        webhook_events: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      return res.status(201).json({ success: true, data: fallbackInstance });
    }
    
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error('Error creating Wasender session:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create session', error: error.message });
  }
};

const getInstances = async (req, res) => {
  try {
    const resp = await wasender.getAllSessions();
    if (!resp.success) {
      return res.status(401).json(resp);
    }
    return res.json(resp);
  } catch (error) {
    console.error('Error fetching sessions from Wasender:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch sessions', error: error.message });
  }
};

const testWasenderAuth = async (req, res) => {
  try {
    const resp = await wasender.testAuth();
    return res.json(resp);
  } catch (error) {
    console.error('Error testing Wasender auth:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to test authentication', error: error.message });
  }
};

const checkRealInstanceStatus = async (req, res) => {
  const { instanceId } = req.params;
  try {
    console.log(`Checking status for session: ${instanceId}`);
    
    // Get session details
    const detailsResult = await wasender.getSessionDetails(instanceId);
    if (!detailsResult.success) {
      console.error('Failed to get session details:', detailsResult.message);
      return res.status(500).json({ 
        success: false, 
        message: `Failed to get session details: ${detailsResult.message}` 
      });
    }
    
    const session = detailsResult.data;
    const waStatus = (session.status || 'unknown').toString().toUpperCase();
    
    console.log(`Session status: ${waStatus}`);

    // Map to UI statuses
    const mapStatus = (s) => {
      switch (s) {
        case 'CONNECTED':
        case 'AUTHENTICATED':
        case 'READY':
          return 'connected';
        case 'CONNECTING':
        case 'INITIALIZING':
          return 'connecting';
        case 'NEED_SCAN':
        case 'REQUIRE_QR':
        case 'UNPAIRED':
        case 'UNPAIRED_IDLE':
          return 'qr';
        case 'LOGGED_OUT':
        case 'DISCONNECTED':
          return 'disconnected';
        default:
          return 'disconnected';
      }
    };

    const status = mapStatus(waStatus);
    
    console.log(`Mapped status: ${status}`);

    return res.json({ 
      success: true, 
      apiStatus: waStatus, 
      status,
      session: {
        id: session.id,
        name: session.name,
        phone_number: session.phone_number,
        status: session.status,
        last_active_at: session.last_active_at
      }
    });
  } catch (error) {
    console.error('Error checking session status:', error.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Error checking session status', 
      error: error.message 
    });
  }
};

const generateQrCode = async (req, res) => {
  const { instanceId } = req.params;
  
  try {
    console.log(`Generating QR code for session: ${instanceId}`);
    
    // Step 1: Connect the session first
    const connectResult = await wasender.connectSession(instanceId);
    if (!connectResult.success) {
      console.error('Failed to connect session:', connectResult.message);
      return res.status(500).json({ 
        success: false, 
        message: `Failed to connect session: ${connectResult.message}` 
      });
    }
    
    console.log('Session connected successfully, getting QR code...');
    
    // Step 2: Get the QR code
    const qrResult = await wasender.getQRCode(instanceId);
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
      
      // Emit socket event for real-time updates
      if (req.io) {
        req.io.emit('instance-status-change', { 
          instanceId, 
          status: 'qr', 
          qrCode: qrImageDataUrl 
        });
      }
      
      return res.json({ 
        success: true, 
        qrCode: qrImageDataUrl, 
        status: 'qr',
        expiresIn: 45 // QR codes expire in 45 seconds
      });
      
    } catch (qrError) {
      console.error('Error converting QR code to image:', qrError);
      
      // Fallback: return the raw data with instructions
      return res.json({ 
        success: true, 
        qrCode: qrCodeData, 
        status: 'qr',
        note: 'Raw QR data - needs manual conversion',
        instructions: 'Please scan this QR code data manually or use a QR code generator',
        expiresIn: 45
      });
    }
    
  } catch (error) {
    console.error('Error generating QR code:', error.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error while generating QR code',
      error: error.message 
    });
  }
};


const deleteInstance = async (req, res) => {
  const { instanceId } = req.params;
  
  try {
    try { await wasender.disconnectSession(instanceId); } catch (_) {}
    try { await wasender.deleteSession(instanceId); } catch (_) {}
    if (req.io) req.io.emit('instance-deleted', { instanceId });
    return res.json({ success: true, message: 'Session deleted' });
  } catch (error) {
    console.error('Error deleting session:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete session', error: error.message });
  }
};

// Note: Wasender API doesn't have a direct webhook setting endpoint
// This function is kept for compatibility but will need to be updated
// when webhook functionality is available in Wasender API
const setWebhook = async (req, res) => {
  const { instanceId } = req.params;
  const { webhookUrl } = req.body;
  
  if (!webhookUrl) {
    return res.status(400).json({
      success: false,
      message: 'Webhook URL is required'
    });
  }
  
  try {
    // Wasender API does not expose webhook setup in the provided collection.
    // Acknowledge and return success so UI can proceed.
    return res.status(200).json({
      success: true,
      message: 'Webhook setup is not supported by the current Wasender API. Value accepted locally.',
      webhookUrl
    });
  } catch (error) {
    console.error('Error setting webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Error setting webhook',
      error: error.message
    });
  }
};

const rebootInstance = async (req, res) => {
  const { instanceId } = req.params;
  
  try {
    try { await wasender.disconnectSession(instanceId); } catch (_) {}
    await wasender.connectSession(instanceId);
    if (req.io) req.io.emit('instance-status-change', { instanceId, status: 'connecting' });
    return res.json({ success: true, message: 'Reconnecting initiated' });
  } catch (error) {
    console.error('Error reconnecting session:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to reconnect', error: error.message });
  }
};


const regenerateQrCode = async (req, res) => {
  const { instanceId } = req.params;
  
  try {
    console.log(`Regenerating QR code for session: ${instanceId}`);
    
    // Use the new regenerate method
    const qrResult = await wasender.regenerateQRCode(instanceId);
    if (!qrResult.success) {
      console.error('Failed to regenerate QR code:', qrResult.message);
      return res.status(500).json({ 
        success: false, 
        message: `Failed to regenerate QR code: ${qrResult.message}` 
      });
    }
    
    let qrCodeData = qrResult.data?.qrcode || null;
    if (!qrCodeData) {
      console.error('No QR code data received after regeneration');
      return res.status(500).json({ 
        success: false, 
        message: 'No QR code data received after regeneration' 
      });
    }
    
    console.log('New QR code data received, converting to image...');
    
    // Convert the raw QR code data to a proper image
    try {
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
      
      console.log('New QR code converted to image successfully');
      
      // Emit socket event for real-time updates
      if (req.io) {
        req.io.emit('instance-status-change', { 
          instanceId, 
          status: 'qr', 
          qrCode: qrImageDataUrl 
        });
      }
      
      return res.json({ 
        success: true, 
        qrCode: qrImageDataUrl, 
        status: 'qr',
        expiresIn: 45,
        regenerated: true
      });
      
    } catch (qrError) {
      console.error('Error converting regenerated QR code to image:', qrError);
      
      return res.json({ 
        success: true, 
        qrCode: qrCodeData, 
        status: 'qr',
        note: 'Raw QR data - needs manual conversion',
        instructions: 'Please scan this QR code data manually or use a QR code generator',
        expiresIn: 45,
        regenerated: true
      });
    }
    
  } catch (error) {
    console.error('Error regenerating QR code:', error.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error while regenerating QR code',
      error: error.message 
    });
  }
};


// =================================================== Send Registration Message =================================================== //


const logOut = async (req, res) => {
  // Clearing the token cookie
  res.clearCookie('token');
  // Redirecting to the login page or any other desired page
  res.redirect('../login');
};

const exportErrorDetailsToExcel = async (req, res) => {
  const { errors } = req.body;
  
  if (!errors || !Array.isArray(errors) || errors.length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'No error data provided for export' 
    });
  }

  try {
    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('Error Details');

    // Simple header row with only essential columns
    const headerRow = worksheet.addRow([
      'Student Name',
      'Parent Phone Number',
      'HW Status',
      'Error Message'
    ]);

    // Add data rows
    errors.forEach((error) => {
      worksheet.addRow([
        error.student || '',
        error.phone || '',
        error.hwStatus || '',
        error.error || ''
      ]);
    });

    // Set column widths
    worksheet.columns = [
      { key: 'studentName', width: 20 },
      { key: 'phoneNumber', width: 15 },
      { key: 'hwStatus', width: 15 },
      { key: 'errorMessage', width: 40 }
    ];

    const excelBuffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ErrorDetails_${new Date().toISOString().split('T')[0]}.xlsx"`
    );

    res.send(excelBuffer);

  } catch (error) {
    console.error('Error exporting error details to Excel:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to export error details to Excel',
      error: error.message 
    });
  }
};



module.exports = {
  dash_get,

  myStudent_get,

  studentsRequests_get,
  // confirmDeleteStudent,
  DeleteStudent,
  searchForUser,
  converStudentRequestsToExcel,
  getSingleUserAllData,
  updateUserData,

  searchToGetOneUserAllData,
  convertToExcelAllUserData,

  addCardGet,
  markAttendance,
  finalizeAttendance,

  addCardToStudent,
  getAttendedUsers,
  removeAttendance,
  updateAmount,

  handelAttendanceGet,
  getDates,
  getAttendees,
  convertAttendeesToExcel,

  // My Student Data
  getStudentData,
  convertAttendaceToExcel,
  

  // WhatsApp

  whatsApp_get,
  sendGradeMessages,
  sendMessages,
  sendCustomMessages,
  sendAttendanceMessages,
  sendCollectionMessages,
  collectionSampleExcel,
  sendCollectionMessages,
  
  // WhatsApp Collection Messages
  
  
  // WhatsApp custom
  

  // WhatsApp 2
  whatsApp2_get,
  getDataStudentInWhatsApp,
  submitData,

  // Connect WhatsApp
  connectWhatsapp_get,
  createInstance,
  getInstances,
  generateQrCode,
  deleteInstance,
  checkRealInstanceStatus,
  testWasenderAuth,
  setWebhook,
  rebootInstance,
  regenerateQrCode,
  // Convert Group
  convertGroup_get,
  getDataToTransferring,
  transferStudent,

  logOut,
  exportErrorDetailsToExcel,


};
