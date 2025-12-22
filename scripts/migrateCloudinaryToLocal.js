const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
require('dotenv').config();

// Import models
const User = require('../models/User');
const Course = require('../models/Course');
const BundleCourse = require('../models/BundleCourse');
const Quiz = require('../models/Quiz');
const Question = require('../models/Question');
const GameRoom = require('../models/GameRoom');
const BrilliantStudent = require('../models/BrilliantStudent');
const TeamMember = require('../models/TeamMember');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dusod9wxt',
  api_key: process.env.CLOUDINARY_API_KEY || '353635965973632',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'rFWFSn4g-dHGj48o3Uu1YxUMZww',
});

// Base directory for uploaded files
const BASE_UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');

// Folder structure mapping
const FOLDER_MAPPING = {
  'profile-pictures': 'profile-pictures',
  'quiz-thumbnails': 'thumbnails',
  'course-thumbnails': 'thumbnails',
  'bundle-thumbnails': 'thumbnails',
  'game-room-thumbnails': 'thumbnails',
  'question-images': 'questions',
  'option-images': 'questions',
  'explanation-images': 'questions',
  'brilliant-students': 'photos',
  'team-members': 'photos',
};

// Statistics
const stats = {
  totalImages: 0,
  downloaded: 0,
  failed: 0,
  skipped: 0,
  updated: 0,
};

/**
 * Download image from URL
 */
async function downloadImage(url, filePath) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const file = require('fs').createWriteStream(filePath);
    
    client.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirects
        return downloadImage(response.headers.location, filePath)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        require('fs').unlinkSync(filePath);
        return reject(new Error(`Failed to download: ${response.statusCode}`));
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      if (require('fs').existsSync(filePath)) {
        require('fs').unlinkSync(filePath);
      }
      reject(err);
    });
  });
}

/**
 * Get file extension from URL
 */
function getFileExtension(url) {
  try {
    const urlPath = new URL(url).pathname;
    const ext = path.extname(urlPath).toLowerCase();
    return ext || '.jpg'; // Default to jpg if no extension
  } catch (e) {
    return '.jpg';
  }
}

/**
 * Determine folder based on Cloudinary URL or context
 */
function determineFolder(cloudinaryUrl, context = '') {
  // Extract folder from Cloudinary URL
  const urlMatch = cloudinaryUrl.match(/\/v\d+\/(.+?)\//);
  if (urlMatch) {
    const cloudinaryFolder = urlMatch[1];
    return FOLDER_MAPPING[cloudinaryFolder] || 'photos';
  }

  // Use context if provided
  if (context) {
    return FOLDER_MAPPING[context] || 'photos';
  }

  return 'photos';
}

/**
 * Generate local file path
 */
function generateLocalPath(cloudinaryUrl, context = '') {
  const folder = determineFolder(cloudinaryUrl, context);
  const ext = getFileExtension(cloudinaryUrl);
  const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
  return path.join(folder, filename);
}

/**
 * Process and download a single image
 */
async function processImage(cloudinaryUrl, context = '') {
  if (!cloudinaryUrl || !cloudinaryUrl.includes('cloudinary')) {
    return null; // Skip non-Cloudinary URLs
  }

  try {
    const relativePath = generateLocalPath(cloudinaryUrl, context);
    const fullPath = path.join(BASE_UPLOAD_DIR, relativePath);
    const dir = path.dirname(fullPath);

    // Create directory if it doesn't exist
    await fs.mkdir(dir, { recursive: true });

    // Download image
    await downloadImage(cloudinaryUrl, fullPath);

    // Return relative path from public directory
    return `/uploads/${relativePath}`;
  } catch (error) {
    console.error(`Error processing image ${cloudinaryUrl}:`, error.message);
    stats.failed++;
    return null;
  }
}

/**
 * Migrate User profile pictures
 */
async function migrateUserProfilePictures() {
  console.log('\n📸 Migrating User Profile Pictures...');
  const users = await User.find({ profilePicture: { $exists: true, $ne: '' } });
  stats.totalImages += users.length;

  for (const user of users) {
    if (!user.profilePicture || !user.profilePicture.includes('cloudinary')) {
      stats.skipped++;
      continue;
    }

    try {
      const localPath = await processImage(user.profilePicture, 'profile-pictures');
      if (localPath) {
        user.profilePicture = localPath;
        await user.save();
        stats.downloaded++;
        stats.updated++;
        console.log(`  ✓ Updated profile picture for user: ${user.username}`);
      }
    } catch (error) {
      console.error(`  ✗ Error updating user ${user._id}:`, error.message);
      stats.failed++;
    }
  }
}

/**
 * Migrate Course thumbnails
 */
async function migrateCourseThumbnails() {
  console.log('\n📸 Migrating Course Thumbnails...');
  const courses = await Course.find({ thumbnail: { $exists: true, $ne: '' } });
  stats.totalImages += courses.length;

  for (const course of courses) {
    if (!course.thumbnail || !course.thumbnail.includes('cloudinary')) {
      stats.skipped++;
      continue;
    }

    try {
      const localPath = await processImage(course.thumbnail, 'course-thumbnails');
      if (localPath) {
        course.thumbnail = localPath;
        await course.save();
        stats.downloaded++;
        stats.updated++;
        console.log(`  ✓ Updated thumbnail for course: ${course.title}`);
      }
    } catch (error) {
      console.error(`  ✗ Error updating course ${course._id}:`, error.message);
      stats.failed++;
    }
  }
}

/**
 * Migrate Bundle Course thumbnails
 */
async function migrateBundleCourseThumbnails() {
  console.log('\n📸 Migrating Bundle Course Thumbnails...');
  const bundles = await BundleCourse.find({ thumbnail: { $exists: true, $ne: '' } });
  stats.totalImages += bundles.length;

  for (const bundle of bundles) {
    if (!bundle.thumbnail || !bundle.thumbnail.includes('cloudinary')) {
      stats.skipped++;
      continue;
    }

    try {
      const localPath = await processImage(bundle.thumbnail, 'bundle-thumbnails');
      if (localPath) {
        bundle.thumbnail = localPath;
        await bundle.save();
        stats.downloaded++;
        stats.updated++;
        console.log(`  ✓ Updated thumbnail for bundle: ${bundle.title}`);
      }
    } catch (error) {
      console.error(`  ✗ Error updating bundle ${bundle._id}:`, error.message);
      stats.failed++;
    }
  }
}

/**
 * Migrate Quiz thumbnails
 */
async function migrateQuizThumbnails() {
  console.log('\n📸 Migrating Quiz Thumbnails...');
  const quizzes = await Quiz.find({ 'thumbnail.url': { $exists: true, $ne: '' } });
  stats.totalImages += quizzes.length;

  for (const quiz of quizzes) {
    if (!quiz.thumbnail?.url || !quiz.thumbnail.url.includes('cloudinary')) {
      stats.skipped++;
      continue;
    }

    try {
      const localPath = await processImage(quiz.thumbnail.url, 'quiz-thumbnails');
      if (localPath) {
        quiz.thumbnail.url = localPath;
        // Save without validation to avoid sourceBank requirement issues
        await quiz.save({ validateBeforeSave: false });
        stats.downloaded++;
        stats.updated++;
        console.log(`  ✓ Updated thumbnail for quiz: ${quiz.title}`);
      }
    } catch (error) {
      console.error(`  ✗ Error updating quiz ${quiz._id}:`, error.message);
      stats.failed++;
    }
  }
}

/**
 * Migrate Question images
 */
async function migrateQuestionImages() {
  console.log('\n📸 Migrating Question Images...');
  const questions = await Question.find({
    $or: [
      { questionImage: { $exists: true, $ne: '' } },
      { 'options.image': { $exists: true, $ne: '' } },
      { explanationImage: { $exists: true, $ne: '' } },
    ],
  });
  stats.totalImages += questions.length;

  for (const question of questions) {
    let updated = false;

    // Migrate question image
    if (question.questionImage && question.questionImage.includes('cloudinary')) {
      try {
        const localPath = await processImage(question.questionImage, 'question-images');
        if (localPath) {
          question.questionImage = localPath;
          updated = true;
          stats.downloaded++;
        }
      } catch (error) {
        console.error(`  ✗ Error updating question image for ${question._id}:`, error.message);
        stats.failed++;
      }
    }

    // Migrate option images
    if (question.options && question.options.length > 0) {
      for (let i = 0; i < question.options.length; i++) {
        const option = question.options[i];
        if (option.image && option.image.includes('cloudinary')) {
          try {
            const localPath = await processImage(option.image, 'option-images');
            if (localPath) {
              option.image = localPath;
              updated = true;
              stats.downloaded++;
            }
          } catch (error) {
            console.error(`  ✗ Error updating option image for question ${question._id}:`, error.message);
            stats.failed++;
          }
        }
      }
    }

    // Migrate explanation image
    if (question.explanationImage && question.explanationImage.includes('cloudinary')) {
      try {
        const localPath = await processImage(question.explanationImage, 'explanation-images');
        if (localPath) {
          question.explanationImage = localPath;
          updated = true;
          stats.downloaded++;
        }
      } catch (error) {
        console.error(`  ✗ Error updating explanation image for ${question._id}:`, error.message);
        stats.failed++;
      }
    }

    if (updated) {
      await question.save();
      stats.updated++;
      console.log(`  ✓ Updated images for question: ${question._id}`);
    } else {
      stats.skipped++;
    }
  }
}

/**
 * Migrate GameRoom thumbnails
 */
async function migrateGameRoomThumbnails() {
  console.log('\n📸 Migrating GameRoom Thumbnails...');
  const gameRooms = await GameRoom.find({ 'thumbnail.url': { $exists: true, $ne: '' } });
  stats.totalImages += gameRooms.length;

  for (const room of gameRooms) {
    if (!room.thumbnail?.url || !room.thumbnail.url.includes('cloudinary')) {
      stats.skipped++;
      continue;
    }

    try {
      const localPath = await processImage(room.thumbnail.url, 'game-room-thumbnails');
      if (localPath) {
        room.thumbnail.url = localPath;
        await room.save();
        stats.downloaded++;
        stats.updated++;
        console.log(`  ✓ Updated thumbnail for game room: ${room.title}`);
      }
    } catch (error) {
      console.error(`  ✗ Error updating game room ${room._id}:`, error.message);
      stats.failed++;
    }
  }
}

/**
 * Migrate BrilliantStudent images
 */
async function migrateBrilliantStudentImages() {
  console.log('\n📸 Migrating BrilliantStudent Images...');
  const students = await BrilliantStudent.find({ image: { $exists: true, $ne: null, $ne: '' } });
  stats.totalImages += students.length;

  for (const student of students) {
    if (!student.image || !student.image.includes('cloudinary')) {
      stats.skipped++;
      continue;
    }

    try {
      const localPath = await processImage(student.image, 'brilliant-students');
      if (localPath) {
        student.image = localPath;
        // Mark as modified to ensure save
        student.markModified('image');
        await student.save();
        stats.downloaded++;
        stats.updated++;
        console.log(`  ✓ Updated image for brilliant student: ${student.name}`);
      }
    } catch (error) {
      console.error(`  ✗ Error updating brilliant student ${student._id}:`, error.message);
      stats.failed++;
    }
  }
}

/**
 * Migrate TeamMember images
 */
async function migrateTeamMemberImages() {
  console.log('\n📸 Migrating TeamMember Images...');
  const members = await TeamMember.find({ image: { $exists: true, $ne: null, $ne: '' } });
  stats.totalImages += members.length;

  for (const member of members) {
    if (!member.image || !member.image.includes('cloudinary')) {
      stats.skipped++;
      continue;
    }

    try {
      const localPath = await processImage(member.image, 'team-members');
      if (localPath) {
        member.image = localPath;
        // Mark as modified to ensure save
        member.markModified('image');
        await member.save();
        stats.downloaded++;
        stats.updated++;
        console.log(`  ✓ Updated image for team member: ${member.name}`);
      }
    } catch (error) {
      console.error(`  ✗ Error updating team member ${member._id}:`, error.message);
      stats.failed++;
    }
  }
}

/**
 * Main migration function
 */
async function migrateAllImages() {
  try {
    console.log('🚀 Starting Cloudinary to Local Migration...\n');

    // Connect to MongoDB
    const mongoUri = process.env.DATABASE_URL || 'mongodb://localhost:27017/elkably-elearning';
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB');

    // Create base upload directory structure
    await fs.mkdir(BASE_UPLOAD_DIR, { recursive: true });
    for (const folder of Object.values(FOLDER_MAPPING)) {
      await fs.mkdir(path.join(BASE_UPLOAD_DIR, folder), { recursive: true });
    }
    console.log('✓ Created upload directories');

    // Run all migrations
    await migrateUserProfilePictures();
    await migrateCourseThumbnails();
    await migrateBundleCourseThumbnails();
    await migrateQuizThumbnails();
    await migrateQuestionImages();
    await migrateGameRoomThumbnails();
    await migrateBrilliantStudentImages();
    await migrateTeamMemberImages();

    // Print statistics
    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Statistics:');
    console.log('='.repeat(50));
    console.log(`Total images found: ${stats.totalImages}`);
    console.log(`Successfully downloaded: ${stats.downloaded}`);
    console.log(`Database records updated: ${stats.updated}`);
    console.log(`Skipped (non-Cloudinary): ${stats.skipped}`);
    console.log(`Failed: ${stats.failed}`);
    console.log('='.repeat(50));

    console.log('\n✅ Migration completed!');
  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateAllImages()
    .then(() => {
      console.log('\n🎉 All done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateAllImages };

