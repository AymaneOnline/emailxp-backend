// emailxp/backend/config/cloudinary.js

const cloudinary = require('cloudinary').v2;

try {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true // Use HTTPS
    });
    console.log('Cloudinary configured successfully.');
} catch (error) {
    console.error('Failed to configure Cloudinary:', error);
    process.exit(1); // Exit process if Cloudinary cannot be initialized
}

module.exports = cloudinary;