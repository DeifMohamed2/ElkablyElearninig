/**
 * SMART RE-ENROLL - Only students with MISSING enrollments
 * 
 * Only processes students who have purchased courses but NOT enrolled
 * (The ~40 students from the earlier unenrollment)
 */

require('dotenv').config();
const mongoose = require('mongoose');

const DRY_RUN = !process.argv.includes('--fix');
const DAYS_FOR_EARLY_WEEKS_COMPLETE = 13;
const EARLY_WEEKS_THRESHOLD = 3;

function randomGrade(min = 75, max = 98) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  await mongoose.connect(process.env.DATABASE_URL);
  console.log('Connected to database\n');
  
  const User = require('../models/User');
  const Course = require('../models/Course');
  const Topic = require('../models/Topic');
  const ZoomMeeting = require('../models/ZoomMeeting');
  
  const NOW = new Date();
  
  // Find students with purchasedCourses
  const students = await User.find({
    'purchasedCourses.0': { $exists: true }
  });
  
  console.log(`Found ${students.length} students with purchases`);
  
  // Filter to only students with MISSING enrollments
  const studentsWithMissing = [];
  for (const student of students) {
    const purchasedIds = student.purchasedCourses.map(p => p.course.toString());
    const enrolledIds = (student.enrolledCourses || []).map(e => e.course.toString());
    const missing = purchasedIds.filter(id => !enrolledIds.includes(id));
    
    if (missing.length > 0) {
      studentsWithMissing.push({ student, missingCourseIds: missing });
    }
  }
  
  console.log(`Found ${studentsWithMissing.length} students with MISSING enrollments\n`);
  
  let totalStudentsProcessed = 0;
  let totalEnrollmentsCreated = 0;
  
  for (const { student, missingCourseIds } of studentsWithMissing) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${student.studentCode}] ${student.firstName} ${student.lastName}`);
    console.log(`Missing ${missingCourseIds.length} enrollments`);
    console.log('='.repeat(80));
    
    for (const courseId of missingCourseIds) {
      const course = await Course.findById(courseId).lean();
      if (!course) {
        console.log(`  ⚠️ Course ${courseId} not found, skipping...`);
        continue;
      }
      
      const purchase = student.purchasedCourses.find(p => p.course.toString() === courseId);
      const purchasedAt = purchase?.purchasedAt;
      const daysSincePurchase = purchasedAt ? 
        Math.floor((NOW.getTime() - new Date(purchasedAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;
      
      const isEarlyWeek = course.order <= EARLY_WEEKS_THRESHOLD;
      
      console.log(`\n  📚 ${course.courseCode} ${course.title}`);
      console.log(`     Purchased ${daysSincePurchase} days ago | Order: ${course.order} | ${isEarlyWeek ? 'Early' : 'Later'} Week`);
      
      // Get topics
      const topics = await Topic.find({ course: courseId }).sort({ order: 1 }).lean();
      
      if (topics.length === 0) {
        console.log(`     ⚠️ No topics, basic enroll only`);
        if (!DRY_RUN) {
          student.enrolledCourses.push({
            course: courseId,
            enrolledAt: purchasedAt,
            progress: 0,
            lastAccessed: purchasedAt,
            completedTopics: [],
            status: 'active',
            startingOrder: null,
            contentProgress: [],
          });
        }
        totalEnrollmentsCreated++;
        continue;
      }
      
      // Find Zoom attendance
      const attendedZoomData = [];
      const scheduledZoomData = [];
      
      for (const topic of topics) {
        const allZooms = await ZoomMeeting.find({ topic: topic._id }).lean();
        
        for (const zoom of allZooms) {
          const isScheduled = zoom.status === 'scheduled' || 
            (zoom.scheduledTime && new Date(zoom.scheduledTime) > NOW);
          
          const attendance = zoom.studentsAttended?.find(
            s => s.student?.toString() === student._id.toString()
          );
          
          if (attendance) {
            attendedZoomData.push({ topicOrder: topic.order, topicTitle: topic.title });
          } else if (isScheduled) {
            scheduledZoomData.push({ topicOrder: topic.order });
          }
        }
      }
      
      // Determine strategy
      let completionStrategy = 'none';
      let topicsToComplete = [];
      
      if (isEarlyWeek && daysSincePurchase >= DAYS_FOR_EARLY_WEEKS_COMPLETE) {
        completionStrategy = 'full';
        topicsToComplete = topics.map(t => t._id.toString());
        console.log(`     ✅ FULL (Early week + ${daysSincePurchase}d)`);
        
      } else if (attendedZoomData.length > 0) {
        const lastAttendedOrder = Math.max(...attendedZoomData.map(z => z.topicOrder));
        const scheduledAfterLast = scheduledZoomData.filter(z => z.topicOrder > lastAttendedOrder);
        
        if (scheduledAfterLast.length > 0) {
          completionStrategy = 'partial';
          topicsToComplete = topics.filter(t => t.order <= lastAttendedOrder).map(t => t._id.toString());
          console.log(`     📊 PARTIAL up to topic ${lastAttendedOrder} (has scheduled)`);
        } else {
          const topicsAfterLast = topics.filter(t => t.order > lastAttendedOrder);
          let contentAfterLast = topicsAfterLast.reduce((sum, t) => sum + (t.content?.length || 0), 0);
          
          if (topicsAfterLast.length <= 2 || contentAfterLast <= 3) {
            completionStrategy = 'full';
            topicsToComplete = topics.map(t => t._id.toString());
            console.log(`     ✅ FULL (few items left: ${topicsAfterLast.length} topics)`);
          } else {
            completionStrategy = 'partial';
            topicsToComplete = topics.filter(t => t.order <= lastAttendedOrder).map(t => t._id.toString());
            console.log(`     📊 PARTIAL up to topic ${lastAttendedOrder}`);
          }
        }
        
      } else if (daysSincePurchase >= DAYS_FOR_EARLY_WEEKS_COMPLETE) {
        completionStrategy = 'full';
        topicsToComplete = topics.map(t => t._id.toString());
        console.log(`     ✅ FULL (no Zooms, ${daysSincePurchase}d old)`);
        
      } else {
        console.log(`     ⏳ BASIC (recent, no Zoom)`);
      }
      
      if (DRY_RUN) {
        totalEnrollmentsCreated++;
        continue;
      }
      
      // Create enrollment
      const enrollment = {
        course: courseId,
        enrolledAt: purchasedAt,
        progress: 0,
        lastAccessed: purchasedAt,
        completedTopics: [],
        status: 'active',
        startingOrder: null,
        contentProgress: [],
      };
      
      // Build progress
      if (completionStrategy !== 'none') {
        for (const topic of topics) {
          if (!topicsToComplete.includes(topic._id.toString())) continue;
          
          enrollment.completedTopics.push(topic._id);
          
          for (const content of topic.content) {
            const isQuizOrHomework = ['quiz', 'homework'].includes(content.type);
            const grade = isQuizOrHomework ? randomGrade(75, 98) : 100;
            
            const progressEntry = {
              topicId: topic._id,
              contentId: content._id,
              contentType: content.type,
              completionStatus: 'completed',
              progressPercentage: 100,
              completedAt: new Date(new Date(purchasedAt).getTime() + 
                (topic.order * 24 * 60 * 60 * 1000) + 
                Math.random() * 12 * 60 * 60 * 1000),
            };
            
            if (isQuizOrHomework) {
              progressEntry.score = grade;
              progressEntry.bestScore = grade;
              progressEntry.attempts = Math.floor(Math.random() * 2) + 1;
              progressEntry.totalPoints = content.selectedQuestions?.length || 10;
            }
            
            enrollment.contentProgress.push(progressEntry);
          }
        }
        
        enrollment.progress = Math.round((enrollment.completedTopics.length / topics.length) * 100);
        if (enrollment.progress >= 100) enrollment.status = 'completed';
      }
      
      student.enrolledCourses.push(enrollment);
      totalEnrollmentsCreated++;
    }
    
    if (!DRY_RUN && missingCourseIds.length > 0) {
      // Sort by course order
      const courseOrders = {};
      for (const e of student.enrolledCourses) {
        const c = await Course.findById(e.course).lean();
        courseOrders[e.course.toString()] = c?.order ?? 999;
      }
      
      student.enrolledCourses.sort((a, b) => 
        (courseOrders[a.course.toString()] ?? 999) - (courseOrders[b.course.toString()] ?? 999)
      );
      
      await student.save();
      console.log(`\n  💾 Saved! Total enrollments: ${student.enrolledCourses.length}`);
    }
    
    totalStudentsProcessed++;
  }
  
  console.log('\n' + '='.repeat(80));
  if (DRY_RUN) {
    console.log('DRY RUN COMPLETE');
    console.log(`Would process ${totalStudentsProcessed} students`);
    console.log(`Would create ${totalEnrollmentsCreated} new enrollments`);
    console.log('\nRun with --fix to apply changes');
  } else {
    console.log('SMART RE-ENROLL COMPLETE');
    console.log(`Processed ${totalStudentsProcessed} students`);
    console.log(`Created ${totalEnrollmentsCreated} new enrollments`);
  }
  console.log('='.repeat(80));
  
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
