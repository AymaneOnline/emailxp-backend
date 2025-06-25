// emailxp/backend/routes/uploadRoutes.js

const express = require('express');
const multer = require('multer');
const cloudinary = require('../config/cloudinary'); // Import Cloudinary config
const { protect } = require('../middleware/authMiddleware'); // Assuming you have an auth middleware

const router = express.Router();

// Configure multer for memory storage (file buffer)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB file size limit (adjust as needed)
});

// @desc    Upload image to Cloudinary
// @route   POST /api/upload/image
// @access  Private (requires authentication)
router.post('/image', protect, upload.single('image'), async (req, res) => {
    if (!req.file) {
        res.status(400);
        throw new Error('No image file provided.');
    }

    try {
        // Upload the image buffer to Cloudinary
        const result = await cloudinary.uploader.upload(
            `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
            {
                folder: 'emailxp_campaign_images', // Optional: folder in Cloudinary
                public_id: `${Date.now()}_${req.file.originalname.replace(/\s/g, '_').split('.')[0]}` // Unique public ID
            }
        );

        // Cloudinary returns the secure URL of the uploaded image
        const imageUrl = result.secure_url;
        console.log(`Image uploaded to Cloudinary: ${imageUrl}`);
        res.status(200).json({ imageUrl: imageUrl });

    } catch (uploadError) {
        console.error('Error uploading to Cloudinary:', uploadError);
        res.status(500).json({ message: 'Failed to upload image.', error: uploadError.message });
    }
});

module.exports = router;