const ExcelJS = require('exceljs');

// Professional Excel Export Utility
class ExcelExporter {
  constructor() {
    this.workbook = new ExcelJS.Workbook();
    this.setupWorkbook();
    this.setupColors();
  }

  setupWorkbook() {
    // Set workbook properties
    this.workbook.creator = 'Elkably E-Learning System';
    this.workbook.lastModifiedBy = 'Admin';
    this.workbook.created = new Date();
    this.workbook.modified = new Date();
    this.workbook.lastPrinted = new Date();
    this.workbook.properties.date1904 = false;
  }

  setupColors() {
    // Professional color scheme
    this.colors = {
      primary: 'FFB80101', // Elkably red
      primaryDark: 'FF8B0000', // Dark red
      secondary: 'FF4472C4', // Blue
      success: 'FF10B981', // Green
      warning: 'FFF59E0B', // Orange
      danger: 'FFEF4444', // Red
      info: 'FF06B6D4', // Cyan
      light: 'FFF8FAFC', // Light gray
      dark: 'FF1E293B', // Dark gray
      white: 'FFFFFFFF',
      border: 'FFE2E8F0',
      alternatingRow: 'FFF2F2F2',
      excellentScore: 'FF10B981', // Green for excellent scores
      goodScore: 'FF3B82F6', // Blue for good scores
      averageScore: 'FFF59E0B', // Orange for average scores
      poorScore: 'FFEF4444', // Red for poor scores
    };
  }

  // Create professional header style
  getHeaderStyle() {
    return {
      font: {
        name: 'Calibri',
        size: 12,
        bold: true,
        color: { argb: this.colors.white },
      },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.colors.primary },
      },
      border: {
        top: { style: 'thin', color: { argb: this.colors.dark } },
        left: { style: 'thin', color: { argb: this.colors.dark } },
        bottom: { style: 'thin', color: { argb: this.colors.dark } },
        right: { style: 'thin', color: { argb: this.colors.dark } },
      },
      alignment: {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      },
    };
  }

  // Create enhanced sub-header style
  getSubHeaderStyle() {
    return {
      font: {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: this.colors.dark },
      },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.colors.light },
      },
      border: {
        top: { style: 'thin', color: { argb: this.colors.border } },
        left: { style: 'thin', color: { argb: this.colors.border } },
        bottom: { style: 'thin', color: { argb: this.colors.border } },
        right: { style: 'thin', color: { argb: this.colors.border } },
      },
      alignment: {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      },
    };
  }

  // Create title style
  getTitleStyle() {
    return {
      font: {
        name: 'Calibri',
        size: 18,
        bold: true,
        color: { argb: this.colors.primary },
      },
      alignment: {
        horizontal: 'center',
        vertical: 'middle',
      },
    };
  }

  // Create section title style
  getSectionTitleStyle() {
    return {
      font: {
        name: 'Calibri',
        size: 14,
        bold: true,
        color: { argb: this.colors.primaryDark },
      },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.colors.light },
      },
      alignment: {
        horizontal: 'left',
        vertical: 'middle',
      },
      border: {
        bottom: { style: 'medium', color: { argb: this.colors.primary } },
      },
    };
  }

  // Get performance-based style for scores
  getPerformanceStyle(score, maxScore = 100) {
    const percentage = (score / maxScore) * 100;
    let bgColor;

    if (percentage >= 90) {
      bgColor = this.colors.excellentScore;
    } else if (percentage >= 80) {
      bgColor = this.colors.goodScore;
    } else if (percentage >= 60) {
      bgColor = this.colors.averageScore;
    } else {
      bgColor = this.colors.poorScore;
    }

    return {
      ...this.getDataStyle(),
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgColor },
      },
      font: {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: this.colors.white },
      },
    };
  }

  // Get status-based style
  getStatusStyle(status) {
    let bgColor;

    switch (status.toLowerCase()) {
      case 'completed':
      case 'passed':
      case 'active':
        bgColor = this.colors.success;
        break;
      case 'in-progress':
      case 'pending':
        bgColor = this.colors.warning;
        break;
      case 'failed':
      case 'inactive':
        bgColor = this.colors.danger;
        break;
      default:
        bgColor = this.colors.info;
    }

    return {
      ...this.getDataStyle(),
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgColor },
      },
      font: {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: this.colors.white },
      },
    };
  }

  // Create data cell style
  getDataStyle() {
    return {
      font: {
        name: 'Calibri',
        size: 11,
      },
      border: {
        top: { style: 'thin', color: { argb: this.colors.border } },
        left: { style: 'thin', color: { argb: this.colors.border } },
        bottom: { style: 'thin', color: { argb: this.colors.border } },
        right: { style: 'thin', color: { argb: this.colors.border } },
      },
      alignment: {
        vertical: 'middle',
        wrapText: true,
      },
    };
  }

  // Create alternating row style
  getAlternatingRowStyle(isEven) {
    return {
      ...this.getDataStyle(),
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: isEven ? this.colors.alternatingRow : this.colors.white,
        },
      },
    };
  }

  // Create summary sheet
  createSummarySheet(title, data, columns, sheetName = null) {
    const finalSheetName = sheetName || 'Summary';
    const worksheet = this.workbook.addWorksheet(finalSheetName);

    // Add title
    worksheet.mergeCells(
      'A1:' + String.fromCharCode(65 + columns.length - 1) + '1'
    );
    worksheet.getCell('A1').value = title;
    worksheet.getCell('A1').font = { name: 'Calibri', size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };
    worksheet.getRow(1).height = 30;

    // Add export info
    worksheet.getCell(
      'A2'
    ).value = `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
    worksheet.getCell('A2').font = { name: 'Calibri', size: 10, italic: true };
    worksheet.getRow(2).height = 20;

    // Add headers
    const headerRow = worksheet.getRow(4);
    columns.forEach((column, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = column.header;
      cell.style = this.getHeaderStyle();
    });
    headerRow.height = 25;

    // Add data
    data.forEach((row, rowIndex) => {
      const dataRow = worksheet.getRow(rowIndex + 5);
      columns.forEach((column, colIndex) => {
        const cell = dataRow.getCell(colIndex + 1);
        cell.value = row[column.key] || '';
        cell.style = this.getAlternatingRowStyle(rowIndex % 2 === 0);

        // Apply special formatting based on column type
        if (column.type === 'date') {
          cell.numFmt = 'dd/mm/yyyy hh:mm';
        } else if (column.type === 'currency') {
          cell.numFmt = '"EGP "#,##0.00';
        } else if (column.type === 'percentage') {
          cell.numFmt = '0.00%';
        }
      });
      dataRow.height = 20;
    });

    // Auto-fit columns
    columns.forEach((column, index) => {
      const col = worksheet.getColumn(index + 1);
      col.width = column.width || 15;
    });

    // Add freeze panes
    worksheet.views = [{ state: 'frozen', ySplit: 4 }];

    return worksheet;
  }

  // Export students data
  async exportStudents(students, isSingleStudent = false) {
    const title = isSingleStudent
      ? `Student Comprehensive Report - ${
          students[0]?.studentCode || 'Unknown'
        }`
      : `Students Comprehensive Report - ${students.length} Students`;

    const columns = [
      { key: 'studentCode', header: 'Student Code', width: 15 },
      { key: 'firstName', header: 'First Name', width: 15 },
      { key: 'lastName', header: 'Last Name', width: 15 },
      { key: 'email', header: 'Email', width: 25 },
      { key: 'username', header: 'Username', width: 15 },
      { key: 'grade', header: 'Grade', width: 10 },
      { key: 'schoolName', header: 'School', width: 20 },
      { key: 'phone', header: 'Phone', width: 15 },
      { key: 'parentPhone', header: 'Parent Phone', width: 15 },
      { key: 'isActive', header: 'Status', width: 10 },
      {
        key: 'enrollmentDate',
        header: 'Enrolled Date',
        width: 15,
        type: 'date',
      },
      { key: 'lastLogin', header: 'Last Login', width: 15, type: 'date' },
      { key: 'totalTimeSpent', header: 'Total Time Spent', width: 15 },
      {
        key: 'averageQuizScore',
        header: 'Avg Quiz Score',
        width: 15,
        type: 'percentage',
      },
      {
        key: 'completionRate',
        header: 'Completion Rate',
        width: 15,
        type: 'percentage',
      },
      { key: 'engagementScore', header: 'Engagement Score', width: 15 },
    ];

    const data = students.map((student) => ({
      studentCode: student.studentCode || '',
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      email: student.studentEmail || '',
      username: student.username || '',
      grade: student.grade || '',
      schoolName: student.schoolName || '',
      phone: student.studentNumber || '',
      parentPhone: student.parentNumber || '',
      isActive: student.isActive ? 'Active' : 'Inactive',
      enrollmentDate: student.createdAt,
      lastLogin: student.lastLogin,
      totalTimeSpent: this.formatTimeSpent(student.totalTimeSpent || 0),
      averageQuizScore: (student.averageQuizScore || 0) / 100,
      completionRate: (student.completionRate || 0) / 100,
      engagementScore: student.engagementScore || 0,
    }));

    const summarySheet = this.createSummarySheet(
      title,
      data,
      columns,
      isSingleStudent ? 'Student Summary' : 'Students Summary'
    );

    // Add detailed sheets for single student
    if (isSingleStudent && students.length > 0) {
      const student = students[0];

      // Comprehensive Course Progress Sheet
      if (
        student.comprehensiveCourseProgress &&
        student.comprehensiveCourseProgress.length > 0
      ) {
        this.createComprehensiveCourseProgressSheet(
          student.comprehensiveCourseProgress
        );
      }

      // Comprehensive Quiz Performance Sheet
      if (
        student.comprehensiveQuizPerformance &&
        student.comprehensiveQuizPerformance.length > 0
      ) {
        this.createComprehensiveQuizPerformanceSheet(
          student.comprehensiveQuizPerformance
        );
      }

      // Comprehensive Purchase History Sheet
      if (
        student.comprehensivePurchaseHistory &&
        student.comprehensivePurchaseHistory.length > 0
      ) {
        this.createComprehensivePurchaseHistorySheet(
          student.comprehensivePurchaseHistory
        );
      }

      // Activity Timeline Sheet
      if (student.activityTimeline && student.activityTimeline.length > 0) {
        this.createStudentActivityTimelineSheet(student.activityTimeline);
      }

      // Engagement Analytics Sheet
      if (student.engagementAnalytics) {
        this.createStudentEngagementAnalyticsSheet(student.engagementAnalytics);
      }

      // Legacy sheets for backward compatibility
      if (student.courseProgress && student.courseProgress.length > 0) {
        this.createCourseProgressSheet(student.courseProgress);
      }

      if (student.quizPerformance && student.quizPerformance.length > 0) {
        this.createQuizPerformanceSheet(student.quizPerformance);
      }

      if (student.purchaseHistory && student.purchaseHistory.length > 0) {
        this.createPurchaseHistorySheet(student.purchaseHistory);
      }
    }

    return this.workbook;
  }

  // Create course progress sheet
  createCourseProgressSheet(courseProgress) {
    const columns = [
      { key: 'courseTitle', header: 'Course Title', width: 30 },
      { key: 'courseCode', header: 'Course Code', width: 15 },
      {
        key: 'enrollmentDate',
        header: 'Enrolled Date',
        width: 15,
        type: 'date',
      },
      {
        key: 'progress',
        header: 'Progress (%)',
        width: 15,
        type: 'percentage',
      },
      { key: 'status', header: 'Status', width: 15 },
      { key: 'lastAccessed', header: 'Last Accessed', width: 15, type: 'date' },
    ];

    const data = courseProgress.map((course) => ({
      courseTitle: course.courseTitle,
      courseCode: course.courseCode,
      enrollmentDate: course.enrollmentDate,
      progress: course.progress / 100,
      status: course.status,
      lastAccessed: course.lastAccessed,
    }));

    this.createSummarySheet(
      'Course Progress Details',
      data,
      columns,
      'Course Progress'
    );
  }

  // Create comprehensive course progress sheet with topics and content
  createComprehensiveCourseProgressSheet(courseProgressData) {
    const worksheet = this.workbook.addWorksheet('Detailed Course Progress');

    // Add title
    worksheet.mergeCells('A1:J1');
    worksheet.getCell('A1').value = 'Comprehensive Course Progress Report';
    worksheet.getCell('A1').style = this.getTitleStyle();
    worksheet.getRow(1).height = 30;

    // Add export info
    worksheet.getCell(
      'A2'
    ).value = `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
    worksheet.getCell('A2').font = { name: 'Calibri', size: 10, italic: true };
    worksheet.getRow(2).height = 20;

    let currentRow = 4;

    courseProgressData.forEach((course, courseIndex) => {
      // Course header
      worksheet.mergeCells(`A${currentRow}:J${currentRow}`);
      worksheet.getCell(
        `A${currentRow}`
      ).value = `Course: ${course.courseTitle} (${course.courseCode})`;
      worksheet.getCell(`A${currentRow}`).style = this.getSectionTitleStyle();
      worksheet.getRow(currentRow).height = 25;
      currentRow++;

      // Course summary row
      const summaryHeaders = [
        'Enrollment Date',
        'Overall Progress',
        'Status',
        'Last Accessed',
        'Time Spent',
        'Completed Topics',
        'Total Topics',
        'Completion Rate',
      ];
      summaryHeaders.forEach((header, index) => {
        const cell = worksheet.getCell(currentRow, index + 1);
        cell.value = header;
        cell.style = this.getSubHeaderStyle();
      });
      worksheet.getRow(currentRow).height = 20;
      currentRow++;

      const summaryValues = [
        course.enrollmentDate
          ? new Date(course.enrollmentDate).toLocaleDateString()
          : 'N/A',
        `${course.progress || 0}%`,
        course.status || 'Not Started',
        course.lastAccessed
          ? new Date(course.lastAccessed).toLocaleDateString()
          : 'Never',
        this.formatTimeSpent(course.timeSpent || 0),
        course.completedTopics || 0,
        course.totalTopics || 0,
        `${course.completionRate || 0}%`,
      ];

      summaryValues.forEach((value, index) => {
        const cell = worksheet.getCell(currentRow, index + 1);
        cell.value = value;

        if (index === 1) {
          // Progress percentage
          cell.style = this.getPerformanceStyle(course.progress || 0, 100);
        } else if (index === 2) {
          // Status
          cell.style = this.getStatusStyle(course.status || 'Not Started');
        } else {
          cell.style = this.getAlternatingRowStyle(true);
        }
      });
      worksheet.getRow(currentRow).height = 20;
      currentRow++;

      // Topics header
      if (course.topics && course.topics.length > 0) {
        currentRow++; // Empty row

        const topicHeaders = [
          'Topic Title',
          'Topic Order',
          'Progress',
          'Status',
          'Content Items',
          'Completed Items',
          'Last Accessed',
          'Time Spent',
        ];
        topicHeaders.forEach((header, index) => {
          const cell = worksheet.getCell(currentRow, index + 1);
          cell.value = header;
          cell.style = this.getHeaderStyle();
        });
        worksheet.getRow(currentRow).height = 25;
        currentRow++;

        // Topics data
        course.topics.forEach((topic, topicIndex) => {
          const topicValues = [
            topic.title || 'Untitled Topic',
            topic.order || topicIndex + 1,
            `${topic.progress || 0}%`,
            topic.status || 'Not Started',
            topic.totalContent || 0,
            topic.completedContent || 0,
            topic.lastAccessed
              ? new Date(topic.lastAccessed).toLocaleDateString()
              : 'Never',
            this.formatTimeSpent(topic.timeSpent || 0),
          ];

          topicValues.forEach((value, index) => {
            const cell = worksheet.getCell(currentRow, index + 1);
            cell.value = value;

            if (index === 2) {
              // Progress
              cell.style = this.getPerformanceStyle(topic.progress || 0, 100);
            } else if (index === 3) {
              // Status
              cell.style = this.getStatusStyle(topic.status || 'Not Started');
            } else {
              cell.style = this.getAlternatingRowStyle(topicIndex % 2 === 0);
            }
          });
          worksheet.getRow(currentRow).height = 20;
          currentRow++;

          // Content items for this topic
          if (topic.content && topic.content.length > 0) {
            // Content sub-header
            currentRow++; // Empty row
            const contentHeaders = [
              'Content Title',
              'Content Type',
              'Status',
              'Score',
              'Attempts',
              'Questions',
              'Time Spent',
              'Last Accessed',
            ];
            contentHeaders.forEach((header, index) => {
              const cell = worksheet.getCell(currentRow, index + 2); // Indent content
              cell.value = header;
              cell.style = this.getSubHeaderStyle();
            });
            worksheet.getRow(currentRow).height = 20;
            currentRow++;

            // Content data
            topic.content.forEach((content, contentIndex) => {
              const contentValues = [
                '', // Empty first column for indentation
                content.title || 'Untitled Content',
                content.contentType || 'Unknown',
                content.status || 'Not Started',
                content.score ? `${content.score}%` : 'N/A',
                content.attempts || 0,
                content.questionCount || 'N/A', // Add question count
                this.formatTimeSpent(content.timeSpent || 0),
                content.lastAccessed
                  ? new Date(content.lastAccessed).toLocaleDateString()
                  : 'Never',
              ];

              contentValues.forEach((value, index) => {
                const cell = worksheet.getCell(currentRow, index + 1);
                cell.value = value;

                if (index === 5 && content.score) {
                  // Score
                  cell.style = this.getPerformanceStyle(content.score, 100);
                } else if (index === 4) {
                  // Status
                  cell.style = this.getStatusStyle(
                    content.status || 'Not Started'
                  );
                } else {
                  cell.style = this.getAlternatingRowStyle(
                    contentIndex % 2 === 0
                  );
                }
              });
              worksheet.getRow(currentRow).height = 18;
              currentRow++;
            });
          }
        });
      }

      currentRow += 2; // Space between courses
    });

    // Auto-fit columns
    worksheet.columns.forEach((column, index) => {
      column.width = [30, 15, 15, 15, 15, 15, 12, 15, 15, 15][index] || 15;
    });

    // Add freeze panes
    worksheet.views = [{ state: 'frozen', ySplit: 4 }];

    return worksheet;
  }

  // Create quiz performance sheet
  createQuizPerformanceSheet(quizPerformance) {
    const columns = [
      { key: 'quizTitle', header: 'Quiz Title', width: 30 },
      { key: 'code', header: 'Quiz Code', width: 15 },
      { key: 'bestScore', header: 'Best Score', width: 15 },
      { key: 'averageScore', header: 'Average Score', width: 15 },
      { key: 'attempts', header: 'Attempts', width: 10 },
      {
        key: 'passRate',
        header: 'Pass Rate (%)',
        width: 15,
        type: 'percentage',
      },
    ];

    const data = quizPerformance.map((quiz) => ({
      quizTitle: quiz.quizTitle,
      code: quiz.code,
      bestScore: quiz.bestScore,
      averageScore: quiz.averageScore,
      attempts: quiz.attempts,
      passRate: quiz.passRate / 100,
    }));

    this.createSummarySheet(
      'Quiz Performance Details',
      data,
      columns,
      'Quiz Performance'
    );
  }

  // Create comprehensive quiz performance sheet
  createComprehensiveQuizPerformanceSheet(quizPerformanceData) {
    const worksheet = this.workbook.addWorksheet('Detailed Quiz Performance');

    // Add title
    worksheet.mergeCells('A1:L1');
    worksheet.getCell('A1').value = 'Comprehensive Quiz Performance Report';
    worksheet.getCell('A1').style = this.getTitleStyle();
    worksheet.getRow(1).height = 30;

    // Add export info
    worksheet.getCell(
      'A2'
    ).value = `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
    worksheet.getCell('A2').font = { name: 'Calibri', size: 10, italic: true };
    worksheet.getRow(2).height = 20;

    let currentRow = 4;

    quizPerformanceData.forEach((quiz, quizIndex) => {
      // Quiz header
      worksheet.mergeCells(`A${currentRow}:L${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = `Quiz: ${quiz.quizTitle} (${
        quiz.code || 'No Code'
      })`;
      worksheet.getCell(`A${currentRow}`).style = this.getSectionTitleStyle();
      worksheet.getRow(currentRow).height = 25;
      currentRow++;

      // Quiz summary
      const summaryHeaders = [
        'Best Score',
        'Average Score',
        'Lowest Score',
        'Total Attempts',
        'Pass Rate',
        'Total Time Spent',
        'Average Time',
        'Total Questions',
        'Course',
      ];
      summaryHeaders.forEach((header, index) => {
        const cell = worksheet.getCell(currentRow, index + 1);
        cell.value = header;
        cell.style = this.getSubHeaderStyle();
      });
      worksheet.getRow(currentRow).height = 20;
      currentRow++;

      const summaryValues = [
        `${quiz.bestScore || 0}%`,
        `${quiz.averageScore || 0}%`,
        `${quiz.lowestScore || 0}%`,
        quiz.totalAttempts || 0,
        `${quiz.passRate || 0}%`,
        this.formatTimeSpent(quiz.totalTimeSpent || 0),
        this.formatTimeSpent(quiz.averageTimeSpent || 0),
        quiz.totalQuestions || 0, // Add total questions display
        quiz.courseName || 'N/A',
      ];

      summaryValues.forEach((value, index) => {
        const cell = worksheet.getCell(currentRow, index + 1);
        cell.value = value;

        if (index === 0 || index === 1) {
          // Best/Average scores
          cell.style = this.getPerformanceStyle(parseFloat(value) || 0, 100);
        } else if (index === 4) {
          // Pass rate
          cell.style = this.getPerformanceStyle(parseFloat(value) || 0, 100);
        } else {
          cell.style = this.getAlternatingRowStyle(true);
        }
      });
      worksheet.getRow(currentRow).height = 20;
      currentRow++;

      // Attempts details
      if (quiz.attempts && quiz.attempts.length > 0) {
        currentRow++; // Empty row

        const attemptHeaders = [
          'Attempt #',
          'Date/Time',
          'Score',
          'Max Score',
          'Percentage',
          'Time Spent',
          'Status',
          'Questions Correct',
          'Questions Total',
          'Accuracy',
        ];
        attemptHeaders.forEach((header, index) => {
          const cell = worksheet.getCell(currentRow, index + 1);
          cell.value = header;
          cell.style = this.getHeaderStyle();
        });
        worksheet.getRow(currentRow).height = 25;
        currentRow++;

        // Attempts data
        quiz.attempts.forEach((attempt, attemptIndex) => {
          const attemptValues = [
            attemptIndex + 1,
            attempt.createdAt
              ? new Date(attempt.createdAt).toLocaleString()
              : 'Unknown',
            attempt.score || 0,
            attempt.maxScore || 100,
            `${attempt.percentage || 0}%`,
            this.formatTimeSpent(attempt.timeSpent || 0),
            attempt.status || 'Unknown',
            attempt.correctAnswers || 0,
            attempt.totalQuestions || 0,
            `${attempt.accuracy || 0}%`,
          ];

          attemptValues.forEach((value, index) => {
            const cell = worksheet.getCell(currentRow, index + 1);
            cell.value = value;

            if (index === 4) {
              // Percentage
              cell.style = this.getPerformanceStyle(
                attempt.percentage || 0,
                100
              );
            } else if (index === 6) {
              // Status
              cell.style = this.getStatusStyle(attempt.status || 'Unknown');
            } else if (index === 9) {
              // Accuracy
              cell.style = this.getPerformanceStyle(attempt.accuracy || 0, 100);
            } else {
              cell.style = this.getAlternatingRowStyle(attemptIndex % 2 === 0);
            }
          });
          worksheet.getRow(currentRow).height = 20;
          currentRow++;

          // Question-level details for this attempt
          if (attempt.questionDetails && attempt.questionDetails.length > 0) {
            currentRow++; // Empty row
            const questionHeaders = [
              'Question #',
              'Question Text',
              'Student Answer',
              'Correct Answer',
              'Is Correct',
              'Time Spent',
              'Points',
            ];
            questionHeaders.forEach((header, index) => {
              const cell = worksheet.getCell(currentRow, index + 2); // Indent
              cell.value = header;
              cell.style = this.getSubHeaderStyle();
            });
            worksheet.getRow(currentRow).height = 20;
            currentRow++;

            attempt.questionDetails.forEach((question, questionIndex) => {
              const questionValues = [
                '', // Empty for indentation
                questionIndex + 1,
                question.questionText
                  ? question.questionText.substring(0, 100) + '...'
                  : 'N/A',
                question.studentAnswer || 'Not answered',
                question.correctAnswer || 'N/A',
                question.isCorrect ? 'Correct' : 'Incorrect',
                this.formatTimeSpent(question.timeSpent || 0),
                question.points || 0,
              ];

              questionValues.forEach((value, index) => {
                const cell = worksheet.getCell(currentRow, index + 1);
                cell.value = value;

                if (index === 5) {
                  // Is Correct
                  cell.style = this.getStatusStyle(
                    question.isCorrect ? 'Correct' : 'Incorrect'
                  );
                } else {
                  cell.style = this.getAlternatingRowStyle(
                    questionIndex % 2 === 0
                  );
                }
              });
              worksheet.getRow(currentRow).height = 18;
              currentRow++;
            });
          }
        });
      }

      currentRow += 2; // Space between quizzes
    });

    // Auto-fit columns
    worksheet.columns.forEach((column, index) => {
      column.width =
        [8, 20, 50, 20, 20, 15, 15, 15, 15, 15, 15, 10][index] || 15;
    });

    // Add freeze panes
    worksheet.views = [{ state: 'frozen', ySplit: 4 }];

    return worksheet;
  }

  // Create purchase history sheet
  createPurchaseHistorySheet(purchaseHistory) {
    const columns = [
      { key: 'bundleTitle', header: 'Bundle Title', width: 30 },
      { key: 'bundleCode', header: 'Bundle Code', width: 15 },
      { key: 'price', header: 'Price', width: 15, type: 'currency' },
      { key: 'purchaseDate', header: 'Purchase Date', width: 15, type: 'date' },
      { key: 'expiryDate', header: 'Expiry Date', width: 15, type: 'date' },
      { key: 'status', header: 'Status', width: 15 },
    ];

    const data = purchaseHistory.map((purchase) => ({
      bundleTitle: purchase.bundleTitle,
      bundleCode: purchase.bundleCode,
      price: purchase.price,
      purchaseDate: purchase.purchaseDate,
      expiryDate: purchase.expiryDate,
      status: purchase.status,
    }));

    this.createSummarySheet(
      'Purchase History Details',
      data,
      columns,
      'Purchase History'
    );
  }

  // Create comprehensive purchase history sheet
  createComprehensivePurchaseHistorySheet(purchaseHistoryData) {
    const worksheet = this.workbook.addWorksheet('Detailed Purchase History');

    // Add title
    worksheet.mergeCells('A1:K1');
    worksheet.getCell('A1').value = 'Comprehensive Purchase History Report';
    worksheet.getCell('A1').style = this.getTitleStyle();
    worksheet.getRow(1).height = 30;

    // Add export info
    worksheet.getCell(
      'A2'
    ).value = `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
    worksheet.getCell('A2').font = { name: 'Calibri', size: 10, italic: true };
    worksheet.getRow(2).height = 20;

    let currentRow = 4;

    purchaseHistoryData.forEach((purchase, purchaseIndex) => {
      // Purchase header
      worksheet.mergeCells(`A${currentRow}:K${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = `Purchase: ${
        purchase.bundleTitle
      } - ${purchase.orderNumber || 'N/A'}`;
      worksheet.getCell(`A${currentRow}`).style = this.getSectionTitleStyle();
      worksheet.getRow(currentRow).height = 25;
      currentRow++;

      // Purchase summary
      const summaryHeaders = [
        'Bundle Code',
        'Price',
        'Purchase Date',
        'Expiry Date',
        'Status',
        'Payment Method',
        'Days Remaining',
        'Usage %',
      ];
      summaryHeaders.forEach((header, index) => {
        const cell = worksheet.getCell(currentRow, index + 1);
        cell.value = header;
        cell.style = this.getSubHeaderStyle();
      });
      worksheet.getRow(currentRow).height = 20;
      currentRow++;

      const daysRemaining = purchase.expiryDate
        ? Math.max(
            0,
            Math.ceil(
              (new Date(purchase.expiryDate) - new Date()) /
                (1000 * 60 * 60 * 24)
            )
          )
        : 'N/A';

      const summaryValues = [
        purchase.bundleCode || 'N/A',
        `$${purchase.price || 0}`,
        purchase.purchaseDate
          ? new Date(purchase.purchaseDate).toLocaleDateString()
          : 'N/A',
        purchase.expiryDate
          ? new Date(purchase.expiryDate).toLocaleDateString()
          : 'N/A',
        purchase.status || 'Unknown',
        purchase.paymentMethod || 'N/A',
        daysRemaining,
        `${purchase.usagePercentage || 0}%`,
      ];

      summaryValues.forEach((value, index) => {
        const cell = worksheet.getCell(currentRow, index + 1);
        cell.value = value;

        if (index === 4) {
          // Status
          cell.style = this.getStatusStyle(purchase.status || 'Unknown');
        } else if (index === 6 && typeof daysRemaining === 'number') {
          // Days remaining
          let statusColor = 'success';
          if (daysRemaining < 30) statusColor = 'warning';
          if (daysRemaining < 7) statusColor = 'danger';
          cell.style = this.getStatusStyle(statusColor);
        } else if (index === 7) {
          // Usage percentage
          cell.style = this.getPerformanceStyle(
            purchase.usagePercentage || 0,
            100
          );
        } else {
          cell.style = this.getAlternatingRowStyle(true);
        }
      });
      worksheet.getRow(currentRow).height = 20;
      currentRow++;

      // Included courses
      if (purchase.includedCourses && purchase.includedCourses.length > 0) {
        currentRow++; // Empty row

        const courseHeaders = [
          'Course Title',
          'Course Code',
          'Enrollment Date',
          'Progress',
          'Status',
          'Time Spent',
          'Last Accessed',
        ];
        courseHeaders.forEach((header, index) => {
          const cell = worksheet.getCell(currentRow, index + 1);
          cell.value = header;
          cell.style = this.getHeaderStyle();
        });
        worksheet.getRow(currentRow).height = 25;
        currentRow++;

        // Courses data
        purchase.includedCourses.forEach((course, courseIndex) => {
          const courseValues = [
            course.title || 'Untitled Course',
            course.courseCode || 'N/A',
            course.enrollmentDate
              ? new Date(course.enrollmentDate).toLocaleDateString()
              : 'Not Enrolled',
            `${course.progress || 0}%`,
            course.status || 'Not Started',
            this.formatTimeSpent(course.timeSpent || 0),
            course.lastAccessed
              ? new Date(course.lastAccessed).toLocaleDateString()
              : 'Never',
          ];

          courseValues.forEach((value, index) => {
            const cell = worksheet.getCell(currentRow, index + 1);
            cell.value = value;

            if (index === 3) {
              // Progress
              cell.style = this.getPerformanceStyle(course.progress || 0, 100);
            } else if (index === 4) {
              // Status
              cell.style = this.getStatusStyle(course.status || 'Not Started');
            } else {
              cell.style = this.getAlternatingRowStyle(courseIndex % 2 === 0);
            }
          });
          worksheet.getRow(currentRow).height = 20;
          currentRow++;
        });
      }

      currentRow += 2; // Space between purchases
    });

    // Auto-fit columns
    worksheet.columns.forEach((column, index) => {
      column.width = [25, 15, 15, 15, 15, 20, 15, 15, 15, 15, 15][index] || 15;
    });

    // Add freeze panes
    worksheet.views = [{ state: 'frozen', ySplit: 4 }];

    return worksheet;
  }

  // Create student activity timeline sheet
  createStudentActivityTimelineSheet(activityData) {
    const worksheet = this.workbook.addWorksheet('Activity Timeline');

    // Add title
    worksheet.mergeCells('A1:H1');
    worksheet.getCell('A1').value = 'Student Activity Timeline Report';
    worksheet.getCell('A1').style = this.getTitleStyle();
    worksheet.getRow(1).height = 30;

    // Add export info
    worksheet.getCell(
      'A2'
    ).value = `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
    worksheet.getCell('A2').font = { name: 'Calibri', size: 10, italic: true };
    worksheet.getRow(2).height = 20;

    // Headers
    const headers = [
      'Date/Time',
      'Activity Type',
      'Description',
      'Course/Quiz',
      'Duration',
      'Score/Progress',
      'Status',
      'Details',
    ];
    headers.forEach((header, index) => {
      const cell = worksheet.getCell(4, index + 1);
      cell.value = header;
      cell.style = this.getHeaderStyle();
    });
    worksheet.getRow(4).height = 25;

    // Activity data
    activityData.forEach((activity, index) => {
      const row = index + 5;
      const values = [
        activity.timestamp
          ? new Date(activity.timestamp).toLocaleString()
          : 'Unknown',
        activity.activityType || 'Unknown',
        activity.description || 'No description',
        activity.courseOrQuiz || 'N/A',
        this.formatTimeSpent(activity.duration || 0),
        activity.scoreOrProgress || 'N/A',
        activity.status || 'Unknown',
        activity.details || 'No details',
      ];

      values.forEach((value, colIndex) => {
        const cell = worksheet.getCell(row, colIndex + 1);
        cell.value = value;

        if (colIndex === 1) {
          // Activity type
          cell.style = this.getStatusStyle(activity.activityType || 'Unknown');
        } else if (colIndex === 6) {
          // Status
          cell.style = this.getStatusStyle(activity.status || 'Unknown');
        } else {
          cell.style = this.getAlternatingRowStyle(index % 2 === 0);
        }
      });
      worksheet.getRow(row).height = 20;
    });

    // Auto-fit columns
    worksheet.columns.forEach((column, index) => {
      column.width = [20, 20, 40, 25, 15, 15, 15, 30][index] || 15;
    });

    // Add freeze panes
    worksheet.views = [{ state: 'frozen', ySplit: 4 }];

    return worksheet;
  }

  // Create student engagement analytics sheet
  createStudentEngagementAnalyticsSheet(engagementData) {
    const worksheet = this.workbook.addWorksheet('Engagement Analytics');

    // Add title
    worksheet.mergeCells('A1:F1');
    worksheet.getCell('A1').value = 'Student Engagement Analytics Report';
    worksheet.getCell('A1').style = this.getTitleStyle();
    worksheet.getRow(1).height = 30;

    let currentRow = 3;

    // Overall engagement metrics
    worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = 'Overall Engagement Metrics';
    worksheet.getCell(`A${currentRow}`).style = this.getSectionTitleStyle();
    currentRow++;

    const engagementMetrics = [
      ['Total Login Days', engagementData.totalLoginDays || 0],
      [
        'Average Session Duration',
        this.formatTimeSpent(engagementData.avgSessionDuration || 0),
      ],
      ['Engagement Score', `${engagementData.engagementScore || 0}/100`],
      ['Activity Streak (Days)', engagementData.activityStreak || 0],
      [
        'Content Interaction Rate',
        `${engagementData.contentInteractionRate || 0}%`,
      ],
      [
        'Quiz Participation Rate',
        `${engagementData.quizParticipationRate || 0}%`,
      ],
    ];

    engagementMetrics.forEach((metric, index) => {
      const cell1 = worksheet.getCell(currentRow, 1);
      const cell2 = worksheet.getCell(currentRow, 2);
      cell1.value = metric[0];
      cell2.value = metric[1];
      cell1.style = this.getSubHeaderStyle();

      if (metric[0].includes('Score') || metric[0].includes('Rate')) {
        const score = parseFloat(metric[1]) || 0;
        cell2.style = this.getPerformanceStyle(score, 100);
      } else {
        cell2.style = this.getAlternatingRowStyle(index % 2 === 0);
      }
      currentRow++;
    });

    currentRow += 2;

    // Weekly activity pattern
    worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = 'Weekly Activity Pattern';
    worksheet.getCell(`A${currentRow}`).style = this.getSectionTitleStyle();
    currentRow++;

    const weeklyHeaders = [
      'Day',
      'Logins',
      'Time Spent',
      'Activities',
      'Avg Score',
      'Engagement',
    ];
    weeklyHeaders.forEach((header, index) => {
      const cell = worksheet.getCell(currentRow, index + 1);
      cell.value = header;
      cell.style = this.getHeaderStyle();
    });
    currentRow++;

    const weekDays = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ];
    weekDays.forEach((day, index) => {
      const dayData = engagementData.weeklyPattern?.[day] || {};
      const values = [
        day,
        dayData.logins || 0,
        this.formatTimeSpent(dayData.timeSpent || 0),
        dayData.activities || 0,
        `${dayData.avgScore || 0}%`,
        `${dayData.engagement || 0}%`,
      ];

      values.forEach((value, colIndex) => {
        const cell = worksheet.getCell(currentRow, colIndex + 1);
        cell.value = value;

        if (colIndex === 4 || colIndex === 5) {
          // Scores and engagement
          cell.style = this.getPerformanceStyle(parseFloat(value) || 0, 100);
        } else {
          cell.style = this.getAlternatingRowStyle(index % 2 === 0);
        }
      });
      currentRow++;
    });

    // Auto-fit columns
    worksheet.columns.forEach((column, index) => {
      column.width = [20, 15, 20, 15, 15, 15][index] || 15;
    });

    return worksheet;
  }

  // Export brilliant students
  async exportBrilliantStudents(students) {
    const title = `Brilliant Students Report - ${students.length} Students`;

    const columns = [
      { key: 'name', header: 'Student Name', width: 25 },
      { key: 'testType', header: 'Test Type', width: 15 },
      { key: 'score', header: 'Score', width: 10 },
      { key: 'maxScore', header: 'Max Score', width: 12 },
      {
        key: 'percentage',
        header: 'Percentage (%)',
        width: 15,
        type: 'percentage',
      },
      { key: 'category', header: 'Category', width: 15 },
      { key: 'university', header: 'University', width: 20 },
      { key: 'major', header: 'Major', width: 20 },
      { key: 'graduationYear', header: 'Graduation Year', width: 15 },
      { key: 'isActive', header: 'Active', width: 10 },
      { key: 'displayOrder', header: 'Display Order', width: 15 },
      { key: 'testimonial', header: 'Testimonial', width: 40 },
    ];

    const data = students.map((student) => ({
      name: student.name,
      testType: student.testType,
      score: student.score,
      maxScore: student.maxScore,
      percentage: student.percentage / 100,
      category: student.category,
      university: student.university || '',
      major: student.major || '',
      graduationYear: student.graduationYear || '',
      isActive: student.isActive ? 'Yes' : 'No',
      displayOrder: student.displayOrder,
      testimonial: student.testimonial || '',
    }));

    this.createSummarySheet(title, data, columns, 'Brilliant Students');
    return this.workbook;
  }

  // Export courses
  async exportCourses(courses) {
    const title = `Courses Report - ${courses.length} Courses`;

    const columns = [
      { key: 'title', header: 'Course Title', width: 30 },
      { key: 'courseCode', header: 'Course Code', width: 15 },
      { key: 'description', header: 'Description', width: 40 },
      { key: 'price', header: 'Price', width: 15, type: 'currency' },
      { key: 'level', header: 'Level', width: 15 },
      { key: 'duration', header: 'Duration', width: 15 },
      { key: 'enrolledStudents', header: 'Enrolled Students', width: 18 },
      { key: 'isActive', header: 'Status', width: 10 },
      { key: 'createdAt', header: 'Created Date', width: 15, type: 'date' },
      { key: 'updatedAt', header: 'Last Updated', width: 15, type: 'date' },
    ];

    const data = courses.map((course) => ({
      title: course.title,
      courseCode: course.courseCode,
      description: course.description || '',
      price: course.price || 0,
      level: course.level || '',
      duration: course.duration || '',
      enrolledStudents: course.enrolledStudents || 0,
      isActive: course.isActive ? 'Active' : 'Inactive',
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    }));

    this.createSummarySheet(title, data, columns, 'Courses');
    return this.workbook;
  }

  // Export orders
  async exportOrders(orders) {
    const title = `Orders Report - ${orders.length} Orders`;

    const columns = [
      { key: 'orderNumber', header: 'Order Number', width: 15 },
      { key: 'studentName', header: 'Student Name', width: 25 },
      { key: 'studentEmail', header: 'Student Email', width: 25 },
      { key: 'items', header: 'Items', width: 30 },
      {
        key: 'totalAmount',
        header: 'Total Amount',
        width: 15,
        type: 'currency',
      },
      { key: 'paymentMethod', header: 'Payment Method', width: 15 },
      { key: 'status', header: 'Status', width: 12 },
      { key: 'createdAt', header: 'Order Date', width: 15, type: 'date' },
      { key: 'processedAt', header: 'Processed Date', width: 15, type: 'date' },
    ];

    const data = orders.map((order) => ({
      orderNumber: order.orderNumber,
      studentName: order.studentName,
      studentEmail: order.studentEmail,
      items: order.items || '',
      totalAmount: order.totalAmount || 0,
      paymentMethod: order.paymentMethod || '',
      status: order.status || '',
      createdAt: order.createdAt,
      processedAt: order.processedAt,
    }));

    this.createSummarySheet(title, data, columns, 'Orders');
    return this.workbook;
  }

  // Export book orders
  async exportBookOrders(bookOrders) {
    const title = `Book Orders Report - ${bookOrders.length} Orders`;

    const columns = [
      { key: 'bookOrderNumber', header: 'Book Order #', width: 18 },
      { key: 'mainOrderNumber', header: 'Main Order #', width: 18 },
      { key: 'bookName', header: 'Book Name', width: 30 },
      { key: 'bundleCode', header: 'Bundle Code', width: 15 },
      { key: 'studentName', header: 'Student Name', width: 25 },
      { key: 'studentEmail', header: 'Student Email', width: 30 },
      { key: 'studentCode', header: 'Student Code', width: 15 },
      {
        key: 'bookPrice',
        header: 'Price (EGP)',
        width: 15,
        type: 'currency',
      },
      { key: 'status', header: 'Status', width: 12 },
      { key: 'trackingNumber', header: 'Tracking Number', width: 20 },
      { key: 'shippingAddress', header: 'Shipping Address', width: 40 },
      { key: 'shippingCity', header: 'City', width: 15 },
      { key: 'shippingState', header: 'State', width: 15 },
      { key: 'shippingCountry', header: 'Country', width: 15 },
      { key: 'shippingPhone', header: 'Phone', width: 15 },
      { key: 'paymentStatus', header: 'Payment Status', width: 15 },
      { key: 'createdAt', header: 'Order Date', width: 18, type: 'date' },
      { key: 'shippedAt', header: 'Shipped Date', width: 18, type: 'date' },
      { key: 'deliveredAt', header: 'Delivered Date', width: 18, type: 'date' },
    ];

    const data = bookOrders.map((order) => ({
      bookOrderNumber: order.orderNumber || '',
      mainOrderNumber: order.purchase?.orderNumber || 'N/A',
      bookName: order.bookName || '',
      bundleCode: order.bundle?.bundleCode || 'N/A',
      studentName: order.user
        ? `${order.user.firstName || ''} ${order.user.lastName || ''}`.trim()
        : 'Unknown',
      studentEmail: order.user?.studentEmail || '',
      studentCode: order.user?.studentCode || '',
      bookPrice: order.bookPrice || 0,
      status: order.status || '',
      trackingNumber: order.trackingNumber || '',
      shippingAddress: order.shippingAddress?.address || '',
      shippingCity: order.shippingAddress?.city || '',
      shippingState: order.shippingAddress?.state || '',
      shippingCountry: order.shippingAddress?.country || '',
      shippingPhone: order.shippingAddress?.phone || '',
      paymentStatus: order.purchase?.paymentStatus || 'N/A',
      createdAt: order.createdAt,
      shippedAt: order.shippedAt || null,
      deliveredAt: order.deliveredAt || null,
    }));

    this.createSummarySheet(title, data, columns, 'Book Orders');
    return this.workbook;
  }

  // Export quizzes
  async exportQuizzes(quizzes) {
    const title = `Quizzes Report - ${quizzes.length} Quizzes`;

    const columns = [
      { key: 'title', header: 'Quiz Title', width: 30 },
      { key: 'code', header: 'Quiz Code', width: 15 },
      { key: 'description', header: 'Description', width: 40 },
      { key: 'questionCount', header: 'Questions', width: 12 },
      { key: 'timeLimit', header: 'Time Limit (min)', width: 15 },
      {
        key: 'passingScore',
        header: 'Passing Score (%)',
        width: 18,
        type: 'percentage',
      },
      { key: 'attempts', header: 'Max Attempts', width: 15 },
      { key: 'isActive', header: 'Status', width: 10 },
      { key: 'createdAt', header: 'Created Date', width: 15, type: 'date' },
    ];

    const data = quizzes.map((quiz) => ({
      title: quiz.title,
      code: quiz.code,
      description: quiz.description || '',
      questionCount: quiz.questions?.length || 0,
      timeLimit: quiz.timeLimit || 0,
      passingScore: (quiz.passingScore || 60) / 100,
      attempts: quiz.maxAttempts || 0,
      isActive: quiz.isActive ? 'Active' : 'Inactive',
      createdAt: quiz.createdAt,
    }));

    this.createSummarySheet(title, data, columns, 'Quizzes');
    return this.workbook;
  }

  // Utility function to format time spent
  formatTimeSpent(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  // Generate Excel buffer
  async generateBuffer() {
    return await this.workbook.xlsx.writeBuffer();
  }

  // Reset workbook for new export
  reset() {
    this.workbook = new ExcelJS.Workbook();
    this.setupWorkbook();
    this.setupColors();
  }

  // Create Zoom meeting attendance report
  async createZoomAttendanceReport(zoomMeeting, course, enrolledStudents) {
    this.reset();

    const worksheet = this.workbook.addWorksheet('Attendance Report');

    // Title
    worksheet.mergeCells('A1:H1');
    worksheet.getCell('A1').value = `Zoom Meeting Attendance Report - ${zoomMeeting.meetingName}`;
    worksheet.getCell('A1').style = this.getTitleStyle();
    worksheet.getRow(1).height = 30;

    // Meeting Information
    worksheet.getCell('A2').value = `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
    worksheet.getCell('A2').font = { name: 'Calibri', size: 10, italic: true };
    worksheet.getRow(2).height = 20;

    let currentRow = 4;

    // Meeting Details Section
    worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = 'Meeting Information';
    worksheet.getCell(`A${currentRow}`).style = this.getSectionTitleStyle();
    currentRow++;

    const meetingInfo = [
      ['Meeting Name', zoomMeeting.meetingName || 'N/A'],
      ['Meeting Topic', zoomMeeting.meetingTopic || 'N/A'],
      ['Course', course ? course.title : 'N/A'],
      ['Course Code', course ? course.courseCode : 'N/A'],
      ['Scheduled Time', zoomMeeting.scheduledStartTime ? new Date(zoomMeeting.scheduledStartTime).toLocaleString() : 'N/A'],
      ['Actual Start Time', zoomMeeting.actualStartTime ? new Date(zoomMeeting.actualStartTime).toLocaleString() : 'N/A'],
      ['Actual End Time', zoomMeeting.actualEndTime ? new Date(zoomMeeting.actualEndTime).toLocaleString() : 'N/A'],
      ['Duration (minutes)', zoomMeeting.actualDuration || 0],
    ];

    meetingInfo.forEach((info, index) => {
      const cell1 = worksheet.getCell(currentRow, 1);
      const cell2 = worksheet.getCell(currentRow, 2);
      cell1.value = info[0];
      cell2.value = info[1];
      cell1.style = this.getSubHeaderStyle();
      cell2.style = this.getAlternatingRowStyle(index % 2 === 0);
      currentRow++;
    });

    currentRow += 2;

    // Statistics Summary
    worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = 'Attendance Statistics';
    worksheet.getCell(`A${currentRow}`).style = this.getSectionTitleStyle();
    currentRow++;

    const totalEnrolled = enrolledStudents ? enrolledStudents.length : 0;
    const totalAttended = zoomMeeting.studentsAttended ? zoomMeeting.studentsAttended.length : 0;
    // Ensure totalNotAttended is never negative (in case of data inconsistencies)
    const totalNotAttended = Math.max(0, totalEnrolled - totalAttended);
    const attendanceRate = totalEnrolled > 0 ? ((totalAttended / totalEnrolled) * 100).toFixed(2) : 0;

    const statsInfo = [
      ['Total Enrolled Students', totalEnrolled],
      ['Students Who Attended', totalAttended],
      ['Students Who Did Not Attend', totalNotAttended],
      ['Attendance Rate (%)', `${attendanceRate}%`],
      ['Average Attendance Percentage', `${zoomMeeting.averageAttendancePercentage || 0}%`],
      ['Max Concurrent Participants', zoomMeeting.maxConcurrentParticipants || 0],
    ];

    statsInfo.forEach((info, index) => {
      const cell1 = worksheet.getCell(currentRow, 1);
      const cell2 = worksheet.getCell(currentRow, 2);
      cell1.value = info[0];
      cell2.value = info[1];
      cell1.style = this.getSubHeaderStyle();
      
      if (index === 3 || index === 4) {
        // Attendance rate columns
        const value = parseFloat(info[1]) || 0;
        cell2.style = this.getPerformanceStyle(value, 100);
      } else {
        cell2.style = this.getAlternatingRowStyle(index % 2 === 0);
      }
      currentRow++;
    });

    currentRow += 2;

    // Students Who Attended
    if (zoomMeeting.studentsAttended && zoomMeeting.studentsAttended.length > 0) {
      worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = 'Students Who Attended';
      worksheet.getCell(`A${currentRow}`).style = this.getSectionTitleStyle();
      currentRow++;

      const attendedHeaders = [
        'Student Code',
        'Student Name',
        'Email',
        'Attendance %',
        'Time Spent (min)',
        'First Join Time',
        'Last Leave Time',
        'Join Events',
      ];
      attendedHeaders.forEach((header, index) => {
        const cell = worksheet.getCell(currentRow, index + 1);
        cell.value = header;
        cell.style = this.getHeaderStyle();
      });
      worksheet.getRow(currentRow).height = 25;
      currentRow++;

      // Get student details for attended students
      const User = require('../models/User');
      const attendedStudentsData = await Promise.all(
        zoomMeeting.studentsAttended.map(async (attendance) => {
          const student = await User.findById(attendance.student);
          return {
            studentCode: student ? student.studentCode : 'N/A',
            name: attendance.name,
            email: attendance.email,
            attendancePercentage: attendance.attendancePercentage || 0,
            totalTimeSpent: attendance.totalTimeSpent || 0,
            firstJoinTime: attendance.firstJoinTime ? new Date(attendance.firstJoinTime).toLocaleString() : 'N/A',
            lastLeaveTime: attendance.lastLeaveTime ? new Date(attendance.lastLeaveTime).toLocaleString() : 'N/A',
            joinEvents: attendance.joinEvents ? attendance.joinEvents.length : 0,
          };
        })
      );

      attendedStudentsData.forEach((student, index) => {
        const values = [
          student.studentCode,
          student.name,
          student.email,
          `${student.attendancePercentage}%`,
          student.totalTimeSpent,
          student.firstJoinTime,
          student.lastLeaveTime,
          student.joinEvents,
        ];

        values.forEach((value, colIndex) => {
          const cell = worksheet.getCell(currentRow, colIndex + 1);
          cell.value = value;
          
          if (colIndex === 3) {
            // Attendance percentage
            cell.style = this.getPerformanceStyle(student.attendancePercentage, 100);
          } else {
            cell.style = this.getAlternatingRowStyle(index % 2 === 0);
          }
        });
        worksheet.getRow(currentRow).height = 20;
        currentRow++;
      });
    }

    currentRow += 2;

    // Students Who Did Not Attend
    if (enrolledStudents && enrolledStudents.length > 0) {
      const attendedStudentIds = zoomMeeting.studentsAttended 
        ? zoomMeeting.studentsAttended.map(a => a.student.toString())
        : [];
      
      const notAttendedStudents = enrolledStudents.filter(
        student => !attendedStudentIds.includes(student._id.toString())
      );

      if (notAttendedStudents.length > 0) {
        worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
        worksheet.getCell(`A${currentRow}`).value = 'Students Who Did Not Attend';
        worksheet.getCell(`A${currentRow}`).style = this.getSectionTitleStyle();
        currentRow++;

        const notAttendedHeaders = [
          'Student Code',
          'Student Name',
          'Email',
          'Grade',
          'School',
          'Parent Phone',
          'Student Phone',
          'Status',
        ];
        notAttendedHeaders.forEach((header, index) => {
          const cell = worksheet.getCell(currentRow, index + 1);
          cell.value = header;
          cell.style = this.getHeaderStyle();
        });
        worksheet.getRow(currentRow).height = 25;
        currentRow++;

        notAttendedStudents.forEach((student, index) => {
          // Format parent phone with country code if available
          const parentPhone = student.parentCountryCode && student.parentNumber
            ? `${student.parentCountryCode}${student.parentNumber}`
            : student.parentNumber || 'N/A';
          
          // Format student phone with country code if available
          const studentPhone = student.studentCountryCode && student.studentNumber
            ? `${student.studentCountryCode}${student.studentNumber}`
            : student.studentNumber || 'N/A';
          
          const values = [
            student.studentCode || 'N/A',
            `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'N/A',
            student.studentEmail || student.email || 'N/A',
            student.grade || 'N/A',
            student.schoolName || 'N/A',
            parentPhone,
            studentPhone,
            student.isActive ? 'Active' : 'Inactive',
          ];

          values.forEach((value, colIndex) => {
            const cell = worksheet.getCell(currentRow, colIndex + 1);
            cell.value = value;
            cell.style = this.getAlternatingRowStyle(index % 2 === 0);
          });
          worksheet.getRow(currentRow).height = 20;
          currentRow++;
        });
      }
    }

    // Auto-fit columns
    worksheet.columns.forEach((column, index) => {
      column.width = [15, 25, 30, 15, 15, 20, 20, 12][index] || 15;
    });

    // Add freeze panes
    worksheet.views = [{ state: 'frozen', ySplit: 4 }];

    return this.workbook;
  }

  // Create comprehensive course details report
  async createCourseDetailsReport(data) {
    const { course, analytics, students, topicsAnalytics } = data;

    // Course Overview Sheet
    const overviewSheet = this.workbook.addWorksheet('Course Overview');

    // Title
    overviewSheet.mergeCells('A1:F1');
    overviewSheet.getCell(
      'A1'
    ).value = `Course Details Report - ${course.title}`;
    overviewSheet.getCell('A1').style = this.getTitleStyle();
    overviewSheet.getRow(1).height = 30;

    // Export info
    overviewSheet.getCell(
      'A2'
    ).value = `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
    overviewSheet.getCell('A2').font = {
      name: 'Calibri',
      size: 10,
      italic: true,
    };
    overviewSheet.getRow(2).height = 20;

    // Course Information
    let currentRow = 4;
    overviewSheet.mergeCells(`A${currentRow}:F${currentRow}`);
    overviewSheet.getCell(`A${currentRow}`).value = 'Course Information';
    overviewSheet.getCell(`A${currentRow}`).style = this.getSectionTitleStyle();
    currentRow++;

    const courseInfo = [
      ['Course Code', course.courseCode || 'N/A'],
      ['Course Title', course.title || 'N/A'],

      ['Level', course.level || 'N/A'],
      ['Subject', course.subject || 'N/A'],
      ['Status', course.status || 'N/A'],
      [
        'Created Date',
        course.createdAt
          ? new Date(course.createdAt).toLocaleDateString()
          : 'N/A',
      ],
      [
        'Last Updated',
        course.updatedAt
          ? new Date(course.updatedAt).toLocaleDateString()
          : 'N/A',
      ],
    ];

    courseInfo.forEach((info, index) => {
      const cell1 = overviewSheet.getCell(currentRow, 1);
      const cell2 = overviewSheet.getCell(currentRow, 2);
      cell1.value = info[0];
      cell2.value = info[1];
      cell1.style = this.getSubHeaderStyle();
      cell2.style = this.getAlternatingRowStyle(index % 2 === 0);
      currentRow++;
    });

    currentRow += 2;

    // Analytics Summary
    overviewSheet.mergeCells(`A${currentRow}:F${currentRow}`);
    overviewSheet.getCell(`A${currentRow}`).value = 'Course Analytics';
    overviewSheet.getCell(`A${currentRow}`).style = this.getSectionTitleStyle();
    currentRow++;

    const analyticsInfo = [
      ['Total Enrolled Students', analytics.totalEnrolled || 0],
      ['Average Progress', `${analytics.averageProgress || 0}%`],
      ['Completion Rate', `${analytics.completionRate || 0}%`],
      ['Content Completion Rate', `${analytics.contentCompletionRate || 0}%`],
      ['Total Topics', topicsAnalytics.length || 0],
      [
        'Total Content Items',
        topicsAnalytics.reduce((sum, topic) => sum + topic.contentCount, 0),
      ],
    ];

    analyticsInfo.forEach((info, index) => {
      const cell1 = overviewSheet.getCell(currentRow, 1);
      const cell2 = overviewSheet.getCell(currentRow, 2);
      cell1.value = info[0];
      cell2.value = info[1];
      cell1.style = this.getSubHeaderStyle();

      if (info[0].includes('Rate') || info[0].includes('Progress')) {
        const value = parseInt(info[1]) || 0;
        cell2.style = this.getPerformanceStyle(value, 100);
      } else {
        cell2.style = this.getAlternatingRowStyle(index % 2 === 0);
      }
      currentRow++;
    });

    // Auto-fit columns
    overviewSheet.getColumn('A').width = 25;
    overviewSheet.getColumn('B').width = 20;

    // Enrolled Students Sheet
    if (students && students.length > 0) {
      const studentsSheet = this.workbook.addWorksheet('Enrolled Students');

      // Title
      studentsSheet.mergeCells('A1:K1');
      studentsSheet.getCell('A1').value = `Enrolled Students - ${course.title}`;
      studentsSheet.getCell('A1').style = this.getTitleStyle();
      studentsSheet.getRow(1).height = 30;

      // Export info
      studentsSheet.getCell(
        'A2'
      ).value = `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
      studentsSheet.getCell('A2').font = {
        name: 'Calibri',
        size: 10,
        italic: true,
      };
      studentsSheet.getRow(2).height = 20;

      // Headers
      const headers = [
        '#',
        'Student Name',
        'Student Code',
        'Email',
        'Grade',
        'School',
        'Progress (%)',
        'Status',
        'Enrolled Date',
        'Last Accessed',
        'Time Spent (min)',
      ];
      headers.forEach((header, index) => {
        const cell = studentsSheet.getCell(4, index + 1);
        cell.value = header;
        cell.style = this.getHeaderStyle();
      });
      studentsSheet.getRow(4).height = 25;

      // Students data
      students.forEach((student, index) => {
        const row = index + 5;
        const values = [
          index + 1,
          student.name || 'N/A',
          student.studentCode || 'N/A',
          student.email || 'N/A',
          student.grade || 'N/A',
          student.schoolName || 'N/A',
          student.progress || 0,
          student.status || 'not-started',
          student.enrolledAt
            ? new Date(student.enrolledAt).toLocaleDateString()
            : 'N/A',
          student.lastAccessed
            ? new Date(student.lastAccessed).toLocaleDateString()
            : 'Never',
          Math.round((student.timeSpent || 0) / 60),
        ];

        values.forEach((value, colIndex) => {
          const cell = studentsSheet.getCell(row, colIndex + 1);
          cell.value = value;

          if (colIndex === 6) {
            // Progress
            cell.style = this.getPerformanceStyle(value, 100);
          } else if (colIndex === 7) {
            // Status
            cell.style = this.getStatusStyle(value);
          } else {
            cell.style = this.getAlternatingRowStyle(index % 2 === 0);
          }
        });
        studentsSheet.getRow(row).height = 20;
      });

      // Auto-fit columns
      studentsSheet.columns.forEach((column, index) => {
        column.width = [8, 25, 15, 25, 10, 20, 12, 15, 15, 15, 15][index] || 15;
      });

      // Add freeze panes
      studentsSheet.views = [{ state: 'frozen', ySplit: 4 }];
    }

    // Topics Analytics Sheet
    if (topicsAnalytics && topicsAnalytics.length > 0) {
      const topicsSheet = this.workbook.addWorksheet('Topics Analytics');

      // Title
      topicsSheet.mergeCells('A1:J1');
      topicsSheet.getCell('A1').value = `Topics Analytics - ${course.title}`;
      topicsSheet.getCell('A1').style = this.getTitleStyle();
      topicsSheet.getRow(1).height = 30;

      // Export info
      topicsSheet.getCell(
        'A2'
      ).value = `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
      topicsSheet.getCell('A2').font = {
        name: 'Calibri',
        size: 10,
        italic: true,
      };
      topicsSheet.getRow(2).height = 20;

      let currentRow = 4;

      topicsAnalytics.forEach((topic, topicIndex) => {
        // Topic header
        topicsSheet.mergeCells(`A${currentRow}:J${currentRow}`);
        topicsSheet.getCell(
          `A${currentRow}`
        ).value = `Topic ${topic.order}: ${topic.title}`;
        topicsSheet.getCell(`A${currentRow}`).style =
          this.getSectionTitleStyle();
        topicsSheet.getRow(currentRow).height = 25;
        currentRow++;

        // Topic summary
        const summaryHeaders = [
          'Content Count',
          'Total Viewers',
          'Total Completions',
        ];
        summaryHeaders.forEach((header, index) => {
          const cell = topicsSheet.getCell(currentRow, index + 1);
          cell.value = header;
          cell.style = this.getSubHeaderStyle();
        });
        currentRow++;

        const summaryValues = [
          topic.contentCount,
          topic.totals.viewers,
          topic.totals.completions,
        ];
        summaryValues.forEach((value, index) => {
          const cell = topicsSheet.getCell(currentRow, index + 1);
          cell.value = value;
          cell.style = this.getAlternatingRowStyle(true);
        });
        currentRow++;

        // Content details
        if (topic.contents && topic.contents.length > 0) {
          currentRow++; // Empty row

          const contentHeaders = [
            '#',
            'Content Title',
            'Type',
            'Views',
            'Completions',
            'Avg Time (min)',
            'Attempts',
            'Avg Score',
            'Pass Rate',
            'Questions',
          ];
          contentHeaders.forEach((header, index) => {
            const cell = topicsSheet.getCell(currentRow, index + 1);
            cell.value = header;
            cell.style = this.getHeaderStyle();
          });
          topicsSheet.getRow(currentRow).height = 25;
          currentRow++;

          topic.contents.forEach((content, contentIndex) => {
            const contentValues = [
              contentIndex + 1,
              content.title,
              content.type,
              content.viewers,
              content.completions,
              Math.round(content.averageTimeSpent / 60),
              content.attempts,
              content.averageScore !== null
                ? `${content.averageScore}%`
                : 'N/A',
              content.passRate !== null ? `${content.passRate}%` : 'N/A',
              content.totalQuestions || 0,
            ];

            contentValues.forEach((value, index) => {
              const cell = topicsSheet.getCell(currentRow, index + 1);
              cell.value = value;

              if (index === 7 && content.averageScore !== null) {
                // Avg Score
                cell.style = this.getPerformanceStyle(
                  content.averageScore,
                  100
                );
              } else if (index === 8 && content.passRate !== null) {
                // Pass Rate
                cell.style = this.getPerformanceStyle(content.passRate, 100);
              } else {
                cell.style = this.getAlternatingRowStyle(
                  contentIndex % 2 === 0
                );
              }
            });
            topicsSheet.getRow(currentRow).height = 20;
            currentRow++;
          });
        }

        currentRow += 2; // Space between topics
      });

      // Auto-fit columns
      topicsSheet.columns.forEach((column, index) => {
        column.width = [8, 30, 15, 10, 12, 15, 10, 12, 12, 10][index] || 15;
      });

      // Add freeze panes
      topicsSheet.views = [{ state: 'frozen', ySplit: 4 }];
    }

    return this.workbook;
  }

  // Create comprehensive topic details report
  async createTopicDetailsReport(data) {
    const { course, topic, analytics, students, contentAnalytics } = data;

    // Topic Overview Sheet
    const overviewSheet = this.workbook.addWorksheet('Topic Overview');

    // Title
    overviewSheet.mergeCells('A1:F1');
    overviewSheet.getCell(
      'A1'
    ).value = `Topic ${topic.order}: ${topic.title} - Details Report`;
    overviewSheet.getCell('A1').style = this.getTitleStyle();
    overviewSheet.getRow(1).height = 30;

    // Export info
    overviewSheet.getCell(
      'A2'
    ).value = `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
    overviewSheet.getCell('A2').font = {
      name: 'Calibri',
      size: 10,
      italic: true,
    };
    overviewSheet.getRow(2).height = 20;

    // Course & Topic Information
    let currentRow = 4;
    overviewSheet.mergeCells(`A${currentRow}:F${currentRow}`);
    overviewSheet.getCell(`A${currentRow}`).value =
      'Course & Topic Information';
    overviewSheet.getCell(`A${currentRow}`).style = this.getSectionTitleStyle();
    currentRow++;

    const courseTopicInfo = [
      ['Course Title', course.title || 'N/A'],
      ['Course Code', course.courseCode || 'N/A'],
      ['Topic Order', topic.order || 'N/A'],
      ['Topic Title', topic.title || 'N/A'],
      ['Topic Description', topic.description || 'N/A'],
      [
        'Estimated Time',
        topic.estimatedTime
          ? `${Math.round((topic.estimatedTime / 60) * 10) / 10} hours`
          : 'N/A',
      ],
      ['Status', topic.isPublished ? 'Published' : 'Draft'],
      ['Content Items', topic.content ? topic.content.length : 0],
    ];

    courseTopicInfo.forEach((info, index) => {
      const cell1 = overviewSheet.getCell(currentRow, 1);
      const cell2 = overviewSheet.getCell(currentRow, 2);
      cell1.value = info[0];
      cell2.value = info[1];
      cell1.style = this.getSubHeaderStyle();
      cell2.style = this.getAlternatingRowStyle(index % 2 === 0);
      currentRow++;
    });

    currentRow += 2;

    // Topic Analytics
    overviewSheet.mergeCells(`A${currentRow}:F${currentRow}`);
    overviewSheet.getCell(`A${currentRow}`).value = 'Topic Analytics';
    overviewSheet.getCell(`A${currentRow}`).style = this.getSectionTitleStyle();
    currentRow++;

    const analyticsInfo = [
      ['Total Enrolled Students', analytics.totalStudents || 0],
      ['Students Who Viewed Topic', analytics.viewedStudents || 0],
      ['Students Who Completed Topic', analytics.completedStudents || 0],
      ['Average Progress', `${analytics.averageProgress || 0}%`],
      ['Completion Rate', `${analytics.completionRate || 0}%`],
      ['Average Time Spent', `${analytics.averageTimeSpent || 0} minutes`],
      ['Total Content Items', analytics.totalContentItems || 0],
    ];

    analyticsInfo.forEach((info, index) => {
      const cell1 = overviewSheet.getCell(currentRow, 1);
      const cell2 = overviewSheet.getCell(currentRow, 2);
      cell1.value = info[0];
      cell2.value = info[1];
      cell1.style = this.getSubHeaderStyle();

      if (info[0].includes('Rate') || info[0].includes('Progress')) {
        const value = parseInt(info[1]) || 0;
        cell2.style = this.getPerformanceStyle(value, 100);
      } else {
        cell2.style = this.getAlternatingRowStyle(index % 2 === 0);
      }
      currentRow++;
    });

    // Auto-fit columns
    overviewSheet.getColumn('A').width = 25;
    overviewSheet.getColumn('B').width = 20;

    // Content Analytics Sheet
    if (contentAnalytics && contentAnalytics.length > 0) {
      const contentSheet = this.workbook.addWorksheet('Content Performance');

      // Title
      contentSheet.mergeCells('A1:K1');
      contentSheet.getCell('A1').value = `Content Performance - ${topic.title}`;
      contentSheet.getCell('A1').style = this.getTitleStyle();
      contentSheet.getRow(1).height = 30;

      // Export info
      contentSheet.getCell(
        'A2'
      ).value = `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
      contentSheet.getCell('A2').font = {
        name: 'Calibri',
        size: 10,
        italic: true,
      };
      contentSheet.getRow(2).height = 20;

      // Headers
      const headers = [
        '#',
        'Content Title',
        'Type',
        'Views',
        'Completions',
        'Completion %',
        'Avg Time (min)',
        'Attempts',
        'Avg Score',
        'Pass Rate',
        'Questions',
      ];
      headers.forEach((header, index) => {
        const cell = contentSheet.getCell(4, index + 1);
        cell.value = header;
        cell.style = this.getHeaderStyle();
      });
      contentSheet.getRow(4).height = 25;

      // Content data
      contentAnalytics.forEach((content, index) => {
        const row = index + 5;
        const values = [
          index + 1,
          content.title || 'N/A',
          content.type || 'unknown',
          content.viewers || 0,
          content.completions || 0,
          content.completionRate || 0,
          content.averageTimeSpent || 0,
          content.attempts || 0,
          content.averageScore !== null ? `${content.averageScore}%` : 'N/A',
          content.passRate !== null ? `${content.passRate}%` : 'N/A',
          content.totalQuestions || 0,
        ];

        values.forEach((value, colIndex) => {
          const cell = contentSheet.getCell(row, colIndex + 1);
          cell.value = value;

          if (colIndex === 5) {
            // Completion %
            cell.style = this.getPerformanceStyle(value, 100);
          } else if (colIndex === 8 && content.averageScore !== null) {
            // Avg Score
            cell.style = this.getPerformanceStyle(content.averageScore, 100);
          } else if (colIndex === 9 && content.passRate !== null) {
            // Pass Rate
            cell.style = this.getPerformanceStyle(content.passRate, 100);
          } else {
            cell.style = this.getAlternatingRowStyle(index % 2 === 0);
          }
        });
        contentSheet.getRow(row).height = 20;
      });

      // Auto-fit columns
      contentSheet.columns.forEach((column, index) => {
        column.width = [8, 30, 15, 10, 12, 12, 15, 10, 12, 12, 10][index] || 15;
      });

      // Add freeze panes
      contentSheet.views = [{ state: 'frozen', ySplit: 4 }];
    }

    // Student Progress Sheet
    if (students && students.length > 0) {
      const studentsSheet = this.workbook.addWorksheet('Student Progress');

      // Title
      studentsSheet.mergeCells('A1:L1');
      studentsSheet.getCell('A1').value = `Student Progress - ${topic.title}`;
      studentsSheet.getCell('A1').style = this.getTitleStyle();
      studentsSheet.getRow(1).height = 30;

      // Export info
      studentsSheet.getCell(
        'A2'
      ).value = `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
      studentsSheet.getCell('A2').font = {
        name: 'Calibri',
        size: 10,
        italic: true,
      };
      studentsSheet.getRow(2).height = 20;

      // Headers
      const headers = [
        '#',
        'Student Name',
        'Student Code',
        'Email',
        'Parent Phone',
        'Student Phone',
        'Grade',
        'School',
        'Progress (%)',
        'Status',
        'Time Spent (min)',
        'Last Activity',
      ];
      headers.forEach((header, index) => {
        const cell = studentsSheet.getCell(4, index + 1);
        cell.value = header;
        cell.style = this.getHeaderStyle();
      });
      studentsSheet.getRow(4).height = 25;

      // Students data
      students.forEach((student, index) => {
        const row = index + 5;
        const values = [
          index + 1,
          student.name || 'N/A',
          student.studentCode || 'N/A',
          student.email || 'N/A',
          student.parentPhone || 'N/A',
          student.studentPhone || 'N/A',
          student.grade || 'N/A',
          student.schoolName || 'N/A',
          student.progress || 0,
          student.status || 'not-started',
          student.totalTimeSpent || 0,
          student.lastActivity
            ? new Date(student.lastActivity).toLocaleDateString()
            : 'Never',
        ];

        values.forEach((value, colIndex) => {
          const cell = studentsSheet.getCell(row, colIndex + 1);
          cell.value = value;

          if (colIndex === 8) {
            // Progress
            cell.style = this.getPerformanceStyle(value, 100);
          } else if (colIndex === 9) {
            // Status
            cell.style = this.getStatusStyle(value);
          } else {
            cell.style = this.getAlternatingRowStyle(index % 2 === 0);
          }
        });
        studentsSheet.getRow(row).height = 20;
      });

      // Auto-fit columns
      studentsSheet.columns.forEach((column, index) => {
        column.width =
          [8, 25, 15, 25, 15, 15, 10, 20, 12, 15, 15, 15][index] || 15;
      });

      // Add freeze panes
      studentsSheet.views = [{ state: 'frozen', ySplit: 4 }];
    }

    return this.workbook;
  }

  // Create comprehensive question bank details report
  async createQuestionBankDetailsReport(data) {
    const { questionBank, stats, questions } = data;

    // Bank Overview Sheet
    const overviewSheet = this.workbook.addWorksheet('Question Bank Overview');

    // Title
    overviewSheet.mergeCells('A1:F1');
    overviewSheet.getCell('A1').value = `Question Bank: ${questionBank.name}`;
    overviewSheet.getCell('A1').style = this.getTitleStyle();
    overviewSheet.getRow(1).height = 30;

    // Export info
    overviewSheet.getCell(
      'A2'
    ).value = `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
    overviewSheet.getCell('A2').font = {
      name: 'Calibri',
      size: 10,
      italic: true,
    };
    overviewSheet.getRow(2).height = 20;

    // Bank Information
    let currentRow = 4;
    overviewSheet.mergeCells(`A${currentRow}:F${currentRow}`);
    overviewSheet.getCell(`A${currentRow}`).value = 'Question Bank Information';
    overviewSheet.getCell(`A${currentRow}`).style = this.getSectionTitleStyle();
    currentRow++;

    const bankInfo = [
      ['Bank Code', questionBank.bankCode || 'N/A'],
      ['Bank Name', questionBank.name || 'N/A'],
      ['Description', questionBank.description || 'N/A'],
      ['Subject', questionBank.subject || 'N/A'],
      ['Status', questionBank.status || 'N/A'],
      [
        'Created Date',
        questionBank.createdAt
          ? new Date(questionBank.createdAt).toLocaleDateString()
          : 'N/A',
      ],
      [
        'Last Updated',
        questionBank.updatedAt
          ? new Date(questionBank.updatedAt).toLocaleDateString()
          : 'N/A',
      ],
    ];

    bankInfo.forEach((info, index) => {
      const cell1 = overviewSheet.getCell(currentRow, 1);
      const cell2 = overviewSheet.getCell(currentRow, 2);
      cell1.value = info[0];
      cell2.value = info[1];
      cell1.style = this.getSubHeaderStyle();
      cell2.style = this.getAlternatingRowStyle(index % 2 === 0);
      currentRow++;
    });

    currentRow += 2;

    // Statistics Summary
    overviewSheet.mergeCells(`A${currentRow}:F${currentRow}`);
    overviewSheet.getCell(`A${currentRow}`).value = 'Question Statistics';
    overviewSheet.getCell(`A${currentRow}`).style = this.getSectionTitleStyle();
    currentRow++;

    const statisticsInfo = [
      ['Total Questions', stats.totalQuestions || 0],
      ['Easy Questions', stats.easyQuestions || 0],
      ['Medium Questions', stats.mediumQuestions || 0],
      ['Hard Questions', stats.hardQuestions || 0],
      ['MCQ Questions', stats.mcqQuestions || 0],
      ['True/False Questions', stats.trueFalseQuestions || 0],
      ['Written Questions', stats.writtenQuestions || 0],
      ['Active Questions', stats.activeQuestions || 0],
      ['Draft Questions', stats.draftQuestions || 0],
      ['Archived Questions', stats.archivedQuestions || 0],
    ];

    statisticsInfo.forEach((info, index) => {
      const cell1 = overviewSheet.getCell(currentRow, 1);
      const cell2 = overviewSheet.getCell(currentRow, 2);
      cell1.value = info[0];
      cell2.value = info[1];
      cell1.style = this.getSubHeaderStyle();
      cell2.style = this.getAlternatingRowStyle(index % 2 === 0);
      currentRow++;
    });

    // Auto-fit columns
    overviewSheet.getColumn('A').width = 25;
    overviewSheet.getColumn('B').width = 20;

    // Questions Details Sheet
    if (questions && questions.length > 0) {
      const questionsSheet = this.workbook.addWorksheet('Questions Details');

      // Title
      questionsSheet.mergeCells('A1:M1');
      questionsSheet.getCell('A1').value = `Questions in ${questionBank.name}`;
      questionsSheet.getCell('A1').style = this.getTitleStyle();
      questionsSheet.getRow(1).height = 30;

      // Export info
      questionsSheet.getCell(
        'A2'
      ).value = `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
      questionsSheet.getCell('A2').font = {
        name: 'Calibri',
        size: 10,
        italic: true,
      };
      questionsSheet.getRow(2).height = 20;

      // Headers
      const headers = [
        '#',
        'Question Text',
        'Type',
        'Difficulty',
        'Options',
        'Correct Answer',
        'Explanation',
        'Points',
        'Tags',
        'Status',
        'Usage Count',
        'Avg Score',
        'Created Date',
      ];
      headers.forEach((header, index) => {
        const cell = questionsSheet.getCell(4, index + 1);
        cell.value = header;
        cell.style = this.getHeaderStyle();
      });
      questionsSheet.getRow(4).height = 25;

      // Questions data
      questions.forEach((question, index) => {
        const row = index + 5;
        const values = [
          question.number,
          question.questionText || 'N/A',
          question.questionType || 'MCQ',
          question.difficulty || 'Easy',
          question.options || 'N/A',
          question.correctAnswer || 'N/A',
          question.explanation || 'N/A',
          question.points || 1,
          question.tags || 'N/A',
          question.status || 'draft',
          question.usageCount || 0,
          question.averageScore || 0,
          question.createdAt || 'N/A',
        ];

        values.forEach((value, colIndex) => {
          const cell = questionsSheet.getCell(row, colIndex + 1);
          cell.value = value;

          if (colIndex === 2) {
            // Type
            cell.style = this.getTypeStyle(value);
          } else if (colIndex === 3) {
            // Difficulty
            cell.style = this.getDifficultyStyle(value);
          } else if (colIndex === 9) {
            // Status
            cell.style = this.getStatusStyle(value);
          } else if (colIndex === 11) {
            // Average Score
            cell.style = this.getPerformanceStyle(value, 100);
          } else {
            cell.style = this.getAlternatingRowStyle(index % 2 === 0);
          }
        });
        questionsSheet.getRow(row).height = 30; // Increased height for better readability
      });

      // Auto-fit columns
      questionsSheet.columns.forEach((column, index) => {
        column.width =
          [8, 40, 12, 12, 60, 30, 40, 10, 25, 12, 12, 12, 15][index] || 15;
      });

      // Add freeze panes
      questionsSheet.views = [{ state: 'frozen', ySplit: 4 }];
    }

    // Questions by Difficulty Sheet
    if (questions && questions.length > 0) {
      const difficultySheet = this.workbook.addWorksheet(
        'Questions by Difficulty'
      );

      // Title
      difficultySheet.mergeCells('A1:F1');
      difficultySheet.getCell(
        'A1'
      ).value = `Questions Grouped by Difficulty - ${questionBank.name}`;
      difficultySheet.getCell('A1').style = this.getTitleStyle();
      difficultySheet.getRow(1).height = 30;

      let currentRow = 3;

      ['Easy', 'Medium', 'Hard'].forEach((difficulty) => {
        const difficultyQuestions = questions.filter(
          (q) => q.difficulty === difficulty
        );

        if (difficultyQuestions.length > 0) {
          // Difficulty section header
          difficultySheet.mergeCells(`A${currentRow}:F${currentRow}`);
          difficultySheet.getCell(
            `A${currentRow}`
          ).value = `${difficulty} Questions (${difficultyQuestions.length})`;
          difficultySheet.getCell(`A${currentRow}`).style =
            this.getDifficultyStyle(difficulty);
          difficultySheet.getRow(currentRow).height = 25;
          currentRow++;

          // Headers for this section
          const headers = [
            '#',
            'Question Text',
            'Type',
            'Correct Answer',
            'Points',
            'Status',
          ];
          headers.forEach((header, index) => {
            const cell = difficultySheet.getCell(currentRow, index + 1);
            cell.value = header;
            cell.style = this.getSubHeaderStyle();
          });
          currentRow++;

          // Questions for this difficulty
          difficultyQuestions.forEach((question, index) => {
            const values = [
              index + 1,
              question.questionText || 'N/A',
              question.questionType || 'MCQ',
              question.correctAnswer || 'N/A',
              question.points || 1,
              question.status || 'draft',
            ];

            values.forEach((value, colIndex) => {
              const cell = difficultySheet.getCell(currentRow, colIndex + 1);
              cell.value = value;
              cell.style = this.getAlternatingRowStyle(index % 2 === 0);
            });
            difficultySheet.getRow(currentRow).height = 25;
            currentRow++;
          });

          currentRow += 2; // Space between sections
        }
      });

      // Auto-fit columns
      difficultySheet.columns.forEach((column, index) => {
        column.width = [8, 50, 15, 30, 10, 15][index] || 15;
      });
    }

    return this.workbook;
  }

  // Create comprehensive quiz details report
  async createQuizDetailsReport(data) {
    this.reset();

    const { quiz, analytics, participants, questions, selectedQuestions } =
      data;

    // Quiz Overview Sheet
    const overviewSheet = this.workbook.addWorksheet('Quiz Overview');

    // Add title
    overviewSheet.mergeCells('A1:F1');
    overviewSheet.getCell('A1').value = `Quiz Report: ${quiz.title}`;
    overviewSheet.getCell('A1').style = this.getTitleStyle();
    overviewSheet.getRow(1).height = 30;

    // Quiz Details Section
    let currentRow = 3;
    overviewSheet.mergeCells(`A${currentRow}:F${currentRow}`);
    overviewSheet.getCell(`A${currentRow}`).value = 'Quiz Information';
    overviewSheet.getCell(`A${currentRow}`).style = this.getSectionTitleStyle();
    currentRow += 2;

    const quizDetails = [
      ['Quiz Code', quiz.code],
      ['Description', quiz.description],
      ['Question Bank', quiz.questionBank],
      ['Test Type', quiz.testType],
      ['Difficulty', quiz.difficulty],
      [
        'Duration (minutes)',
        quiz.duration === 0 ? 'No time limit' : quiz.duration,
      ],
      ['Passing Score (%)', quiz.passingScore],
      ['Max Attempts', quiz.maxAttempts],
      ['Total Questions', quiz.totalQuestions],
      ['Total Points', quiz.totalPoints],
      ['Status', quiz.status],
      ['Created By', quiz.createdBy],
      [
        'Created Date',
        quiz.createdAt ? new Date(quiz.createdAt).toLocaleDateString() : 'N/A',
      ],
      [
        'Last Modified',
        quiz.lastModified
          ? new Date(quiz.lastModified).toLocaleDateString()
          : 'N/A',
      ],
      ['Instructions', quiz.instructions || 'None'],
      ['Shuffle Questions', quiz.shuffleQuestions ? 'Yes' : 'No'],
      ['Shuffle Options', quiz.shuffleOptions ? 'Yes' : 'No'],
      ['Show Correct Answers', quiz.showCorrectAnswers ? 'Yes' : 'No'],
      ['Show Results', quiz.showResults ? 'Yes' : 'No'],
    ];

    quizDetails.forEach(([key, value]) => {
      overviewSheet.getCell(`A${currentRow}`).value = key;
      overviewSheet.getCell(`A${currentRow}`).style = this.getSubHeaderStyle();
      overviewSheet.getCell(`B${currentRow}`).value = value;
      overviewSheet.getCell(`B${currentRow}`).style = this.getDataStyle();
      currentRow++;
    });

    // Analytics Section
    currentRow += 2;
    overviewSheet.mergeCells(`A${currentRow}:F${currentRow}`);
    overviewSheet.getCell(`A${currentRow}`).value = 'Performance Analytics';
    overviewSheet.getCell(`A${currentRow}`).style = this.getSectionTitleStyle();
    currentRow += 2;

    const analyticsData = [
      ['Total Participants', analytics.totalParticipants],
      ['Total Attempts', analytics.totalAttempts],
      ['Average Score (%)', analytics.averageScore],
      ['Pass Rate (%)', analytics.passRate],
      ['Average Time Spent (seconds)', Math.round(analytics.averageTimeSpent)],
      ['Excellent Scores (90%+)', analytics.scoreDistribution.excellent],
      ['Good Scores (70-89%)', analytics.scoreDistribution.good],
      ['Average Scores (50-69%)', analytics.scoreDistribution.average],
      ['Poor Scores (<50%)', analytics.scoreDistribution.poor],
    ];

    analyticsData.forEach(([key, value]) => {
      overviewSheet.getCell(`A${currentRow}`).value = key;
      overviewSheet.getCell(`A${currentRow}`).style = this.getSubHeaderStyle();
      overviewSheet.getCell(`B${currentRow}`).value = value;
      overviewSheet.getCell(`B${currentRow}`).style = this.getDataStyle();
      currentRow++;
    });

    // Auto-fit columns in overview
    overviewSheet.columns = [
      { width: 25 },
      { width: 40 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
    ];

    // Participants Sheet
    if (participants && participants.length > 0) {
      const participantsSheet = this.workbook.addWorksheet('Participants');

      const participantColumns = [
        { key: 'studentCode', header: 'Student Code', width: 15 },
        { key: 'firstName', header: 'First Name', width: 15 },
        { key: 'lastName', header: 'Last Name', width: 15 },
        { key: 'email', header: 'Email', width: 25 },
        { key: 'grade', header: 'Grade', width: 10 },
        { key: 'totalAttempts', header: 'Total Attempts', width: 12 },
        { key: 'bestScore', header: 'Best Score (%)', width: 12 },
        { key: 'averageScore', header: 'Average Score (%)', width: 15 },
        { key: 'passed', header: 'Passed', width: 10 },
        { key: 'totalTimeSpent', header: 'Total Time (sec)', width: 15 },
        { key: 'lastAttemptDate', header: 'Last Attempt', width: 15 },
      ];

      participantsSheet.columns = participantColumns;

      // Style headers
      const headerRow = participantsSheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.style = this.getHeaderStyle();
      });
      headerRow.height = 25;

      // Add participant data
      participants.forEach((participant, index) => {
        const rowData = {
          studentCode: participant.studentCode,
          firstName: participant.firstName,
          lastName: participant.lastName,
          email: participant.email,
          grade: participant.grade,
          totalAttempts: participant.totalAttempts,
          bestScore: participant.bestScore,
          averageScore: participant.averageScore,
          passed: participant.passed ? 'Yes' : 'No',
          totalTimeSpent: Math.round(participant.totalTimeSpent),
          lastAttemptDate: participant.lastAttemptDate
            ? new Date(participant.lastAttemptDate).toLocaleDateString()
            : 'N/A',
        };

        const row = participantsSheet.addRow(rowData);
        row.eachCell((cell, colNumber) => {
          if (colNumber === 7 || colNumber === 8) {
            // Score columns
            cell.style = this.getPerformanceStyle(cell.value, 100);
          } else if (colNumber === 9) {
            // Passed column
            cell.style = this.getStatusStyle(
              participant.passed ? 'passed' : 'failed'
            );
          } else {
            cell.style = this.getAlternatingRowStyle(index % 2 === 0);
          }
        });
        row.height = 20;
      });

      participantsSheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    // Questions Performance Sheet
    if (questions && questions.length > 0) {
      const questionsSheet = this.workbook.addWorksheet('Question Performance');

      const questionColumns = [
        { key: 'questionNumber', header: 'Q#', width: 5 },
        { key: 'questionText', header: 'Question Text', width: 50 },
        { key: 'questionType', header: 'Type', width: 12 },
        { key: 'difficulty', header: 'Difficulty', width: 12 },
        { key: 'points', header: 'Points', width: 8 },
        { key: 'totalAnswers', header: 'Total Answers', width: 12 },
        { key: 'correctAnswers', header: 'Correct Answers', width: 15 },
        { key: 'accuracyRate', header: 'Accuracy Rate (%)', width: 15 },
        { key: 'tags', header: 'Tags', width: 20 },
      ];

      questionsSheet.columns = questionColumns;

      // Style headers
      const headerRow = questionsSheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.style = this.getHeaderStyle();
      });
      headerRow.height = 25;

      // Add question performance data
      questions.forEach((question, index) => {
        const row = questionsSheet.addRow(question);
        row.eachCell((cell, colNumber) => {
          if (colNumber === 8) {
            // Accuracy rate column
            cell.style = this.getPerformanceStyle(cell.value, 100);
          } else if (colNumber === 3) {
            // Question type column
            cell.style = this.getTypeStyle(question.questionType);
          } else if (colNumber === 4) {
            // Difficulty column
            cell.style = this.getDifficultyStyle(question.difficulty);
          } else {
            cell.style = this.getAlternatingRowStyle(index % 2 === 0);
          }
        });
        row.height = 20;
      });

      questionsSheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    // Selected Questions Sheet (Full Question Details)
    if (selectedQuestions && selectedQuestions.length > 0) {
      const selectedQuestionsSheet =
        this.workbook.addWorksheet('Quiz Questions');

      const selectedQuestionColumns = [
        { key: 'order', header: 'Order', width: 8 },
        { key: 'points', header: 'Points', width: 8 },
        { key: 'questionText', header: 'Question Text', width: 50 },
        { key: 'questionType', header: 'Type', width: 12 },
        { key: 'difficulty', header: 'Difficulty', width: 12 },
        { key: 'options', header: 'Options', width: 60 },
        { key: 'correctAnswer', header: 'Correct Answer', width: 30 },
        { key: 'explanation', header: 'Explanation', width: 40 },
        { key: 'tags', header: 'Tags', width: 20 },
      ];

      selectedQuestionsSheet.columns = selectedQuestionColumns;

      // Style headers
      const headerRow = selectedQuestionsSheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.style = this.getHeaderStyle();
      });
      headerRow.height = 25;

      // Add selected questions data
      selectedQuestions.forEach((question, index) => {
        const row = selectedQuestionsSheet.addRow(question);
        row.eachCell((cell, colNumber) => {
          if (colNumber === 4) {
            // Question type column
            cell.style = this.getTypeStyle(question.questionType);
          } else if (colNumber === 5) {
            // Difficulty column
            cell.style = this.getDifficultyStyle(question.difficulty);
          } else {
            cell.style = this.getAlternatingRowStyle(index % 2 === 0);
          }
        });
        row.height = 20;
      });

      selectedQuestionsSheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    // Detailed Attempts Sheet
    if (participants && participants.length > 0) {
      const attemptsSheet = this.workbook.addWorksheet('Detailed Attempts');

      const attemptColumns = [
        { key: 'studentCode', header: 'Student Code', width: 15 },
        { key: 'studentName', header: 'Student Name', width: 20 },
        { key: 'attemptNumber', header: 'Attempt #', width: 10 },
        { key: 'score', header: 'Score (%)', width: 10 },
        { key: 'timeSpent', header: 'Time Spent (sec)', width: 15 },
        { key: 'correctAnswers', header: 'Correct Answers', width: 15 },
        { key: 'totalQuestions', header: 'Total Questions', width: 15 },
        { key: 'passed', header: 'Passed', width: 10 },
        { key: 'startedAt', header: 'Started At', width: 20 },
        { key: 'completedAt', header: 'Completed At', width: 20 },
      ];

      attemptsSheet.columns = attemptColumns;

      // Style headers
      const headerRow = attemptsSheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.style = this.getHeaderStyle();
      });
      headerRow.height = 25;

      // Add detailed attempts data
      let rowIndex = 0;
      participants.forEach((participant) => {
        participant.attempts.forEach((attempt) => {
          const rowData = {
            studentCode: participant.studentCode,
            studentName: `${participant.firstName} ${participant.lastName}`,
            attemptNumber: attempt.attemptNumber,
            score: attempt.score,
            timeSpent: Math.round(attempt.timeSpent),
            correctAnswers: attempt.correctAnswers,
            totalQuestions: attempt.totalQuestions,
            passed: attempt.passed ? 'Yes' : 'No',
            startedAt: attempt.startedAt
              ? new Date(attempt.startedAt).toLocaleString()
              : 'N/A',
            completedAt: attempt.completedAt
              ? new Date(attempt.completedAt).toLocaleString()
              : 'N/A',
          };

          const row = attemptsSheet.addRow(rowData);
          row.eachCell((cell, colNumber) => {
            if (colNumber === 4) {
              // Score column
              cell.style = this.getPerformanceStyle(cell.value, 100);
            } else if (colNumber === 8) {
              // Passed column
              cell.style = this.getStatusStyle(
                attempt.passed ? 'passed' : 'failed'
              );
            } else {
              cell.style = this.getAlternatingRowStyle(rowIndex % 2 === 0);
            }
          });
          row.height = 20;
          rowIndex++;
        });
      });

      attemptsSheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    return this.workbook;
  }

  // Helper method for type styling
  getTypeStyle(type) {
    const baseStyle = this.getAlternatingRowStyle(true);
    switch (type) {
      case 'MCQ':
        return {
          ...baseStyle,
          fill: {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE3F2FD' },
          },
        };
      case 'True/False':
        return {
          ...baseStyle,
          fill: {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF3E5F5' },
          },
        };
      case 'Written':
        return {
          ...baseStyle,
          fill: {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE8F5E8' },
          },
        };
      default:
        return baseStyle;
    }
  }

  // Helper method for difficulty styling
  getDifficultyStyle(difficulty) {
    const baseStyle = this.getSectionTitleStyle();
    switch (difficulty) {
      case 'Easy':
        return {
          ...baseStyle,
          fill: {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: this.colors.success },
          },
        };
      case 'Medium':
        return {
          ...baseStyle,
          fill: {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: this.colors.warning },
          },
        };
      case 'Hard':
        return {
          ...baseStyle,
          fill: {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: this.colors.danger },
          },
        };
      default:
        return baseStyle;
    }
  }
}

module.exports = ExcelExporter;
