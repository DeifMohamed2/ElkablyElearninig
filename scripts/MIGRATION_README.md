# Cloudinary to Local Storage Migration Guide

This guide explains how to migrate all images from Cloudinary to your local VPS server.

## Overview

The migration script will:
1. Download all images from Cloudinary
2. Organize them into folders (profile-pictures, thumbnails, questions, photos)
3. Update all database records to use local paths instead of Cloudinary URLs
4. Preserve the same folder structure for easy organization

## Folder Structure

After migration, images will be organized as follows:

```
public/uploads/
├── profile-pictures/     # User profile pictures
├── thumbnails/           # Course, bundle, quiz, and game room thumbnails
├── questions/           # Question images, option images, explanation images
└── photos/              # Brilliant student photos, team member photos
```

## Prerequisites

1. Make sure MongoDB is running and accessible
2. Ensure you have Cloudinary credentials in your `.env` file:
   ```
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   MONGODB_URI=your_mongodb_uri
   ```
3. Ensure you have enough disk space for all images
4. Make sure the `public/uploads` directory is writable

## Running the Migration

### Step 1: Backup Your Database

**IMPORTANT:** Always backup your database before running the migration!

```bash
# Example MongoDB backup
mongodump --uri="your_mongodb_uri" --out=./backup-$(date +%Y%m%d)
```

### Step 2: Run the Migration Script

```bash
node scripts/migrateCloudinaryToLocal.js
```

The script will:
- Connect to MongoDB
- Find all images in the following models:
  - User (profilePicture)
  - Course (thumbnail)
  - BundleCourse (thumbnail)
  - Quiz (thumbnail.url)
  - Question (questionImage, options[].image, explanationImage)
  - GameRoom (thumbnail.url)
  - BrilliantStudent (image)
  - TeamMember (image)
- Download each Cloudinary image
- Save to appropriate local folders
- Update database records with new local paths

### Step 3: Verify the Migration

After migration, check:
1. Images are in `public/uploads/` folders
2. Database records have been updated (check a few records manually)
3. Application still works correctly

## Configuration

### Using Local Storage (Default)

By default, the application now uses local storage. This is controlled by the `USE_LOCAL_STORAGE` environment variable:

```env
USE_LOCAL_STORAGE=true  # Use local storage (default)
```

### Using Cloudinary (Legacy)

If you need to switch back to Cloudinary temporarily:

```env
USE_LOCAL_STORAGE=false  # Use Cloudinary
```

## What Gets Migrated

The migration script processes:

1. **User Profile Pictures** → `public/uploads/profile-pictures/`
2. **Course Thumbnails** → `public/uploads/thumbnails/`
3. **Bundle Course Thumbnails** → `public/uploads/thumbnails/`
4. **Quiz Thumbnails** → `public/uploads/thumbnails/`
5. **Question Images** → `public/uploads/questions/`
   - Question images
   - Option images
   - Explanation images
6. **GameRoom Thumbnails** → `public/uploads/thumbnails/`
7. **BrilliantStudent Images** → `public/uploads/photos/`
8. **TeamMember Images** → `public/uploads/photos/`

## Troubleshooting

### Images Not Downloading

- Check your internet connection
- Verify Cloudinary credentials are correct
- Check if Cloudinary URLs are accessible

### Database Update Failures

- Ensure MongoDB connection is stable
- Check database permissions
- Review error logs for specific record issues

### Disk Space Issues

- Check available disk space before migration
- Consider migrating in batches if you have many images

### Permission Errors

- Ensure `public/uploads` directory is writable
- Check file system permissions

## After Migration

1. **Test the Application**: Verify all images display correctly
2. **Monitor Storage**: Keep an eye on disk space usage
3. **Update Backups**: Include `public/uploads` in your backup strategy
4. **Optional**: Delete images from Cloudinary after verifying everything works

## Rollback

If you need to rollback:

1. Restore your database backup
2. Set `USE_LOCAL_STORAGE=false` in `.env`
3. Restart the application

## Support

If you encounter issues:
1. Check the migration script logs
2. Verify all prerequisites are met
3. Review the error messages for specific guidance

