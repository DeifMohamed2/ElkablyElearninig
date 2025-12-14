const mongoose = require('mongoose');

// ZoomMeeting schema for comprehensive meeting management
const zoomMeetingSchema = new mongoose.Schema({
  // Meeting Basic Info
  meetingName: {
    type: String,
    required: true,
    trim: true,
  },
  meetingId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  meetingTopic: {
    type: String,
    required: true,
  },

  // Relationship to Topic
  topic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    required: true,
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },

  // Host Information
  hostId: {
    type: String,
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  },

  // Scheduling Information
  scheduledStartTime: {
    type: Date,
    required: true,
  },
  duration: {
    type: Number,
    required: true, // in minutes
  },
  timezone: {
    type: String,
    default: 'UTC',
  },

  // Actual Meeting Times
  actualStartTime: {
    type: Date,
  },
  actualEndTime: {
    type: Date,
  },
  actualDuration: {
    type: Number, // in minutes
  },

  // Meeting Status
  status: {
    type: String,
    enum: ['scheduled', 'active', 'ended', 'cancelled'],
    default: 'scheduled',
    index: true,
  },

  // Meeting URLs and Access
  joinUrl: {
    type: String,
    required: true,
  },
  startUrl: {
    type: String,
    required: true,
  },
  password: {
    type: String,
  },

  // Meeting Settings
  settings: {
    joinBeforeHost: {
      type: Boolean,
      default: true,
    },
    waitingRoom: {
      type: Boolean,
      default: false,
    },
    muteUponEntry: {
      type: Boolean,
      default: false,
    },
    hostVideo: {
      type: Boolean,
      default: true,
    },
    participantVideo: {
      type: Boolean,
      default: true,
    },
    recording: {
      type: Boolean,
      default: false,
    },
    autoRecording: {
      type: String,
      enum: ['none', 'local', 'cloud'],
      default: 'none',
    },
  },

  // Recording Information
  recordingStatus: {
    type: String,
    enum: ['not_recorded', 'recording', 'processing', 'completed', 'failed', 'uploading'],
    default: 'not_recorded',
  },
  recordingUrl: {
    type: String, // Original Zoom recording URL (backup)
  },
  bunnyVideoId: {
    type: String, // Bunny CDN video ID
  },
  bunnyVideoUrl: {
    type: String, // Bunny CDN playback URL
  },

  // Students who watched the recording (after session ended)
  studentsWatchedRecording: [
    {
      student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      watchedAt: {
        type: Date,
        default: Date.now,
      },
      completedWatching: {
        type: Boolean,
        default: false,
      },
      watchDuration: {
        type: Number, // in minutes
        default: 0,
      },
    },
  ],

  // Attendance Tracking
  studentsAttended: [
    {
      student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true, // Required again since we only allow enrolled students
      },
      name: {
        type: String,
        required: true,
      },
      email: {
        type: String,
        required: true,
      },
      zoomParticipantId: {
        type: String,
      },

      // Join/Leave Events
      joinEvents: [
        {
          joinTime: {
            type: Date,
            required: true,
          },
          leaveTime: {
            type: Date,
          },
          duration: {
            type: Number, // in minutes
          },
          cameraStatus: {
            type: String,
            enum: ['on', 'off', 'unknown'],
            default: 'unknown',
          },
          micStatus: {
            type: String,
            enum: ['on', 'off', 'unknown'],
            default: 'unknown',
          },
          // Timeline of camera/mic status changes during this session
          statusTimeline: [
            {
              timestamp: {
                type: Date,
                required: true,
              },
              cameraStatus: {
                type: String,
                enum: ['on', 'off', 'unknown'],
              },
              micStatus: {
                type: String,
                enum: ['on', 'off', 'unknown'],
              },
              action: {
                type: String,
                enum: [
                  'join',
                  'leave',
                  'camera_on',
                  'camera_off',
                  'mic_on',
                  'mic_off',
                ],
                required: true,
              },
            },
          ],
        },
      ],

      // Aggregated Stats
      totalTimeSpent: {
        type: Number,
        default: 0, // in minutes
      },
      attendancePercentage: {
        type: Number,
        default: 0,
      },
      firstJoinTime: {
        type: Date,
      },
      lastLeaveTime: {
        type: Date,
      },
      isCurrentlyInMeeting: {
        type: Boolean,
        default: false,
      },
    },
  ],

  // Statistics
  totalParticipants: {
    type: Number,
    default: 0,
  },
  maxConcurrentParticipants: {
    type: Number,
    default: 0,
  },
  averageAttendancePercentage: {
    type: Number,
    default: 0,
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexes for performance
zoomMeetingSchema.index({ topic: 1, status: 1 });
zoomMeetingSchema.index({ course: 1, status: 1 });
zoomMeetingSchema.index({ scheduledStartTime: 1 });
zoomMeetingSchema.index({ 'studentsAttended.student': 1 });

// Pre-save middleware to update timestamps
zoomMeetingSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Method to calculate attendance statistics
zoomMeetingSchema.methods.calculateAttendanceStats = function () {
  if (!this.actualDuration || this.actualDuration === 0) {
    console.log('⚠️ Cannot calculate attendance stats: no actual duration');
    return;
  }

  console.log(
    '📊 Calculating attendance stats for meeting duration:',
    this.actualDuration,
    'minutes'
  );

  let totalAttendancePercentage = 0;

  this.studentsAttended.forEach((student, index) => {
    console.log(`👤 Student ${index + 1}: ${student.name}`);
    console.log(`⏱️ Total time spent: ${student.totalTimeSpent} minutes`);

    if (student.totalTimeSpent > 0) {
      // Calculate attendance percentage based on actual meeting duration
      // Use exact calculation with one decimal place for accuracy
      const rawPercentage =
        (student.totalTimeSpent / this.actualDuration) * 100;
      // Round to 1 decimal place for accuracy (e.g., 88.5% instead of 88% or 89%)
      // But if it's a whole number, keep it as whole number (e.g., 88% not 88.0%)
      const calculatedPercentage = Math.min(100, Math.round(rawPercentage * 10) / 10);
      student.attendancePercentage = calculatedPercentage;

      console.log(
        `📈 Attendance percentage: ${student.attendancePercentage}% (${student.totalTimeSpent}/${this.actualDuration} minutes)`
      );

      totalAttendancePercentage += student.attendancePercentage;
    } else {
      student.attendancePercentage = 0;
      console.log(`📈 Attendance percentage: 0% (no time spent)`);
    }
  });

  // Calculate average attendance percentage
  if (this.studentsAttended.length > 0) {
    this.averageAttendancePercentage = Math.round(
      totalAttendancePercentage / this.studentsAttended.length
    );
  } else {
    this.averageAttendancePercentage = 0;
  }

  this.totalParticipants = this.studentsAttended.length;

  console.log('📊 Final meeting stats:', {
    totalParticipants: this.totalParticipants,
    averageAttendance: this.averageAttendancePercentage + '%',
    actualDuration: this.actualDuration + ' minutes',
  });
};

// Method to find a student in attendance by multiple criteria
zoomMeetingSchema.methods.findStudentInAttendance = function (criteria) {
  if (!criteria) return null;

  return this.studentsAttended.find((student) => {
    // Check by student ID
    if (
      criteria.studentId &&
      student.student &&
      student.student.toString() === criteria.studentId.toString()
    ) {
      return true;
    }

    // Check by email (case insensitive)
    if (
      criteria.email &&
      student.email &&
      student.email.toLowerCase() === criteria.email.toLowerCase()
    ) {
      return true;
    }

    // Check by name (case insensitive)
    if (
      criteria.name &&
      student.name &&
      student.name.toLowerCase() === criteria.name.toLowerCase()
    ) {
      return true;
    }

    // Check by Zoom participant ID
    if (
      criteria.zoomParticipantId &&
      student.zoomParticipantId &&
      student.zoomParticipantId === criteria.zoomParticipantId
    ) {
      return true;
    }

    return false;
  });
};

// Method to add or update student attendance
zoomMeetingSchema.methods.updateStudentAttendance = function (studentData) {
  // Validation for required fields
  if (!studentData.studentId) {
    throw new Error('Student ID is required for attendance tracking');
  }
  if (!studentData.email || !studentData.name) {
    throw new Error('Student name and email are required for join tracking');
  }

  // Find existing student by multiple criteria for better matching
  const existingStudent = this.studentsAttended.find(
    (s) =>
      s.student.toString() === studentData.studentId.toString() ||
      s.email === studentData.email ||
      s.name === studentData.name
  );

  if (existingStudent) {
    // Update existing student attendance
    console.log(
      '📝 Updating existing student attendance:',
      existingStudent.name
    );

    // Ensure data is up to date and fill in missing information
    if (!existingStudent.name && studentData.name) {
      existingStudent.name = studentData.name;
    }
    if (!existingStudent.email && studentData.email) {
      existingStudent.email = studentData.email;
    }
    if (!existingStudent.zoomParticipantId && studentData.zoomParticipantId) {
      existingStudent.zoomParticipantId = studentData.zoomParticipantId;
    }
    // Update student reference if it was missing
    if (!existingStudent.student && studentData.studentId) {
      existingStudent.student = studentData.studentId;
    }

    if (studentData.joinTime && !studentData.leaveTime) {
      // New join event
      const newJoinEvent = {
        joinTime: studentData.joinTime,
        cameraStatus: studentData.cameraStatus || 'off',
        micStatus: studentData.micStatus || 'off',
        statusTimeline: [
          {
            timestamp: studentData.joinTime,
            cameraStatus: studentData.cameraStatus || 'off',
            micStatus: studentData.micStatus || 'off',
            action: 'join',
          },
        ],
      };

      existingStudent.joinEvents.push(newJoinEvent);

      if (!existingStudent.firstJoinTime) {
        existingStudent.firstJoinTime = studentData.joinTime;
      }

      existingStudent.isCurrentlyInMeeting = true;
      console.log(
        '✅ Join event recorded for existing student with status timeline'
      );
    } else if (studentData.leaveTime) {
      // Update the last join event with leave time
      const lastJoinEvent = existingStudent.joinEvents
        .filter((event) => !event.leaveTime)
        .pop();

      if (lastJoinEvent) {
        lastJoinEvent.leaveTime = studentData.leaveTime;
        const joinTimeMs = new Date(lastJoinEvent.joinTime).getTime();
        const leaveTimeMs = new Date(studentData.leaveTime).getTime();
        const durationMs = leaveTimeMs - joinTimeMs;
        // Calculate duration in minutes with precision (round to 1 decimal place)
        const durationMinutes = Math.max(
          0,
          Math.round((durationMs / (1000 * 60)) * 10) / 10
        );

        lastJoinEvent.duration = durationMinutes;

        console.log(
          `⏱️ Session duration calculation for ${existingStudent.name}:`
        );
        console.log(
          `Join: ${lastJoinEvent.joinTime} -> Leave: ${studentData.leaveTime}`
        );
        console.log(`Duration: ${durationMinutes} minutes`);

        // Add leave event to status timeline
        lastJoinEvent.statusTimeline.push({
          timestamp: studentData.leaveTime,
          cameraStatus: lastJoinEvent.cameraStatus,
          micStatus: lastJoinEvent.micStatus,
          action: 'leave',
        });

        // Update total time spent - recalculate from all sessions with precision
        let totalSeconds = 0;
        existingStudent.joinEvents.forEach((event) => {
          if (event.duration && event.duration > 0) {
            totalSeconds += event.duration * 60; // Convert minutes to seconds
          } else if (event.joinTime && event.leaveTime) {
            // Calculate if duration not set
            const durationMs = new Date(event.leaveTime) - new Date(event.joinTime);
            totalSeconds += durationMs / 1000;
          }
        });
        // Convert back to minutes with precision (round to 1 decimal)
        existingStudent.totalTimeSpent = Math.round((totalSeconds / 60) * 10) / 10;

        existingStudent.lastLeaveTime = studentData.leaveTime;
        existingStudent.isCurrentlyInMeeting = false;

        console.log(
          `📊 Updated total time spent: ${existingStudent.totalTimeSpent} minutes`
        );
        console.log('✅ Leave event recorded for existing student');
      }
    }
  } else {
    // Add new student - all required fields are validated above
    console.log('➕ Adding new student attendance:', studentData.name);

    const newStudent = {
      student: studentData.studentId,
      name: studentData.name,
      email: studentData.email,
      zoomParticipantId: studentData.zoomParticipantId,
      joinEvents: [],
      totalTimeSpent: 0,
      isCurrentlyInMeeting: false,
    };

    if (studentData.joinTime) {
      const newJoinEvent = {
        joinTime: studentData.joinTime,
        cameraStatus: studentData.cameraStatus || 'off',
        micStatus: studentData.micStatus || 'off',
        statusTimeline: [
          {
            timestamp: studentData.joinTime,
            cameraStatus: studentData.cameraStatus || 'off',
            micStatus: studentData.micStatus || 'off',
            action: 'join',
          },
        ],
      };

      newStudent.joinEvents.push(newJoinEvent);
      newStudent.firstJoinTime = studentData.joinTime;
      newStudent.isCurrentlyInMeeting = true;
      newStudent.totalTimeSpent = 0; // Will be calculated when they leave
    }

    this.studentsAttended.push(newStudent);
    console.log(
      '✅ New student attendance record created with status timeline'
    );
  }

  // Update total participants count
  this.totalParticipants = this.studentsAttended.length;

  // Update max concurrent participants if needed
  const currentlyInMeeting = this.studentsAttended.filter(
    (s) => s.isCurrentlyInMeeting
  ).length;
  if (currentlyInMeeting > this.maxConcurrentParticipants) {
    this.maxConcurrentParticipants = currentlyInMeeting;
  }
};

// Method to update student camera/mic status during meeting
zoomMeetingSchema.methods.updateStudentStatus = function (
  studentInfo,
  statusUpdate
) {
  const existingStudent = this.findStudentInAttendance({
    email: studentInfo.email,
    name: studentInfo.name,
    zoomParticipantId: studentInfo.zoomParticipantId,
  });

  if (!existingStudent || !existingStudent.isCurrentlyInMeeting) {
    console.log('⚠️ Student not found or not in meeting:', studentInfo.name);
    return;
  }

  // Find the current join event (without leave time)
  const currentJoinEvent = existingStudent.joinEvents
    .filter((event) => !event.leaveTime)
    .pop();

  if (!currentJoinEvent) {
    console.log('⚠️ No active join event found for student:', studentInfo.name);
    return;
  }

  // Determine what changed and add to status timeline
  const timestamp = new Date();
  let action = '';
  let statusChanged = false;

  // Only update camera status if it's provided and different from current
  if (
    statusUpdate.cameraStatus &&
    statusUpdate.cameraStatus !== 'unknown' &&
    statusUpdate.cameraStatus !== currentJoinEvent.cameraStatus
  ) {
    action = statusUpdate.cameraStatus === 'on' ? 'camera_on' : 'camera_off';
    currentJoinEvent.cameraStatus = statusUpdate.cameraStatus;
    statusChanged = true;
  }

  // Only update mic status if it's provided and different from current
  if (
    statusUpdate.micStatus &&
    statusUpdate.micStatus !== 'unknown' &&
    statusUpdate.micStatus !== currentJoinEvent.micStatus
  ) {
    if (action) {
      // If both camera and mic changed, prioritize the one provided
      action = statusUpdate.micStatus === 'on' ? 'mic_on' : 'mic_off';
    } else {
      action = statusUpdate.micStatus === 'on' ? 'mic_on' : 'mic_off';
    }
    currentJoinEvent.micStatus = statusUpdate.micStatus;
    statusChanged = true;
  }

  // Only add to timeline if there was an actual status change
  if (statusChanged && action) {
    currentJoinEvent.statusTimeline.push({
      timestamp: timestamp,
      cameraStatus: currentJoinEvent.cameraStatus,
      micStatus: currentJoinEvent.micStatus,
      action: action,
    });

    console.log(
      `📹 Status update for ${
        existingStudent.name
      }: ${action} at ${timestamp.toLocaleTimeString()}`
    );
    console.log(
      `📊 Current status - Camera: ${currentJoinEvent.cameraStatus}, Mic: ${currentJoinEvent.micStatus}`
    );
  } else {
    console.log(
      `📝 No status change for ${existingStudent.name} - Camera: ${currentJoinEvent.cameraStatus}, Mic: ${currentJoinEvent.micStatus}`
    );
  }
};

// Method to start meeting
zoomMeetingSchema.methods.startMeeting = function () {
  this.status = 'active';
  this.actualStartTime = new Date();
  return this.save();
};

// Method to end meeting
zoomMeetingSchema.methods.endMeeting = function () {
  this.status = 'ended';
  this.actualEndTime = new Date();

  // Calculate actual duration - use actualStartTime if available, otherwise use first student join time
  let startTime = this.actualStartTime;
  
  if (!startTime && this.studentsAttended && this.studentsAttended.length > 0) {
    // Find the earliest join time from all students
    const earliestJoinTimes = this.studentsAttended
      .map(student => {
        if (student.joinEvents && student.joinEvents.length > 0) {
          return student.joinEvents
            .map(event => new Date(event.joinTime))
            .filter(time => !isNaN(time.getTime()));
        }
        return [];
      })
      .flat();
    
    if (earliestJoinTimes.length > 0) {
      startTime = new Date(Math.min(...earliestJoinTimes.map(t => t.getTime())));
      this.actualStartTime = startTime; // Set it for future reference
      console.log(`📅 Using earliest student join time as meeting start: ${startTime.toLocaleString()}`);
    }
  }

  if (startTime) {
    const durationMs = this.actualEndTime - startTime;
    // Calculate duration in minutes with precision (round to 1 decimal place)
    const durationMinutes = durationMs / (1000 * 60);
    this.actualDuration = Math.round(durationMinutes * 10) / 10; // Round to 1 decimal place
    console.log(`⏱️ Meeting duration: ${this.actualDuration} minutes (${durationMs}ms)`);
    console.log(`📅 Start: ${startTime.toLocaleString()}, End: ${this.actualEndTime.toLocaleString()}`);
  } else {
    console.warn('⚠️ Cannot calculate meeting duration: no start time available');
  }

  console.log(
    '📊 Ending meeting - Processing attendance for',
    this.studentsAttended.length,
    'students'
  );

  // For all students, ensure their attendance is properly closed
  this.studentsAttended.forEach((student, index) => {
    console.log(`👤 Processing student ${index + 1}:`, student.name);

    // Find any join events without leave times (student still in meeting)
    const openJoinEvents = student.joinEvents.filter(
      (event) => !event.leaveTime
    );

    if (openJoinEvents.length > 0) {
      console.log(
        `📝 Found ${openJoinEvents.length} open join events for ${student.name}`
      );

      // Close all open join events with meeting end time
      openJoinEvents.forEach((joinEvent, eventIndex) => {
        joinEvent.leaveTime = this.actualEndTime;
        const durationMs = this.actualEndTime - new Date(joinEvent.joinTime);
        // Use more precise calculation (in seconds, then convert to minutes with decimals)
        const eventDurationSeconds = Math.max(0, durationMs / 1000);
        const eventDurationMinutes = eventDurationSeconds / 60;
        // Store duration in minutes with precision
        joinEvent.duration = Math.round(eventDurationMinutes * 10) / 10; // Round to 1 decimal

        console.log(
          `⏱️ Closed join event ${eventIndex + 1} for ${
            student.name
          }, duration: ${joinEvent.duration} minutes`
        );
      });
    }

    // Recalculate total time spent for this student (sum all durations)
    // Use more precise calculation
    let totalSeconds = 0;
    student.joinEvents.forEach((event) => {
      if (event.duration) {
        totalSeconds += event.duration * 60; // Convert minutes to seconds
      } else if (event.joinTime && event.leaveTime) {
        // Calculate if duration not set
        const durationMs = new Date(event.leaveTime) - new Date(event.joinTime);
        totalSeconds += durationMs / 1000;
      }
    });
    // Convert back to minutes with precision
    student.totalTimeSpent = Math.round((totalSeconds / 60) * 10) / 10; // Round to 1 decimal

    // Update student status
    student.isCurrentlyInMeeting = false;
    student.lastLeaveTime = this.actualEndTime;

    console.log(
      `✅ Final stats for ${student.name}: ${student.totalTimeSpent} minutes total`
    );
  });

  // Calculate final attendance statistics
  this.calculateAttendanceStats();

  console.log('📈 Meeting statistics calculated:', {
    actualDuration: this.actualDuration,
    averageAttendance: this.averageAttendancePercentage,
    totalParticipants: this.totalParticipants,
  });

  return this.save();
};

// Static method to get meeting by meetingId
zoomMeetingSchema.statics.findByMeetingId = function (meetingId) {
  return this.findOne({ meetingId });
};

// Static method to get active meetings for a course
zoomMeetingSchema.statics.getActiveMeetings = function (courseId) {
  return this.find({
    course: courseId,
    status: { $in: ['scheduled', 'active'] },
  }).sort({ scheduledStartTime: -1 });
};

// Virtual for checking if meeting is locked (not started yet)
zoomMeetingSchema.virtual('isLocked').get(function () {
  return this.status === 'scheduled';
});

// Virtual for checking if meeting is available (started)
zoomMeetingSchema.virtual('isAvailable').get(function () {
  return this.status === 'active';
});

// Ensure virtuals are included in JSON
zoomMeetingSchema.set('toJSON', { virtuals: true });
zoomMeetingSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('ZoomMeeting', zoomMeetingSchema);
