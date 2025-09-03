// emailxp/backend/utils/fileUpload.js

const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Validate Cloudinary configuration
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('Cloudinary configuration missing. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.');
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer storage for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'emailxp-profile-pictures',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
    transformation: [
      { 
        width: 400, 
        height: 400, 
        crop: 'fill',
        gravity: 'center',
        quality: 'auto'
      }
    ],
  },
});

console.log('Cloudinary storage configured with params:', {
  folder: 'emailxp-profile-pictures',
  allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
  transformation: [
    { 
      width: 400, 
      height: 400, 
      crop: 'fill',
      gravity: 'center',
      quality: 'auto'
    }
  ]
});

// Configure multer upload
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log('Processing file:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      console.log('File type validation passed');
      cb(null, true);
    } else {
      console.log('File type validation failed:', file.mimetype);
      cb(new Error('Only image files are allowed!'), false);
    }
  },
});

// Middleware for single file upload
const uploadProfilePicture = upload.single('profilePicture');

// Error handling middleware for multer
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File size too large. Maximum size is 5MB.' });
    }
    return res.status(400).json({ message: 'File upload error: ' + error.message });
  } else if (error) {
    return res.status(400).json({ message: error.message });
  }
  next();
};

// Helper function to delete old profile picture from Cloudinary
const deleteProfilePicture = async (publicId) => {
  if (!publicId) return;
  
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Error deleting profile picture:', error);
  }
};

// Helper function to extract public ID from Cloudinary URL
const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  
  // Extract public ID from Cloudinary URL
  // Example URL: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/image.jpg
  const matches = url.match(/\/upload\/.*\/([^\/]+)\./);
  return matches ? matches[1] : null;
};

module.exports = {
  uploadProfilePicture,
  handleUploadError,
  deleteProfilePicture,
  getPublicIdFromUrl,
  cloudinary,
};
