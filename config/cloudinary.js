// emailxp/backend/config/cloudinary.js

const cloudinary = require('cloudinary').v2;

// Optional debug logs only in non-production environments
if (process.env.NODE_ENV !== 'production') {
  console.log('--- Cloudinary Config Check ---');
  console.log('CLOUDINARY_CLOUD_NAME (present):', !!process.env.CLOUDINARY_CLOUD_NAME);
  console.log('CLOUDINARY_API_KEY (present):', !!process.env.CLOUDINARY_API_KEY);
  console.log('CLOUDINARY_API_SECRET (present/length):', process.env.CLOUDINARY_API_SECRET ? `Loaded, length: ${process.env.CLOUDINARY_API_SECRET.length}` : 'NOT LOADED');
  console.log('-----------------------------');
}


try {
    // Check if any critical variable is missing or empty before attempting to configure
    if (!process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME.trim() === '') {
        throw new Error('CLOUDINARY_CLOUD_NAME is missing or empty.');
    }
    if (!process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY.trim() === '') {
        throw new Error('CLOUDINARY_API_KEY is missing or empty.');
    }
    if (!process.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET.trim() === '') {
        throw new Error('CLOUDINARY_API_SECRET is missing or empty.');
    }

    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true
    });
    console.log('Cloudinary configured successfully.');
} catch (error) {
    console.error('Failed to configure Cloudinary:', error.message);
    // If the error is about missing keys, this will prevent the server from starting.
    // In a real production app, you might want a more graceful degradation or error page.
    process.exit(1);
}

module.exports = cloudinary;