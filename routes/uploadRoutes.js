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
        // Define a unique public ID for the image
        // It's good practice to derive it from the original filename and a timestamp
        const uniquePublicId = `emailxp_campaign_images/${Date.now()}_${req.file.originalname.replace(/\s/g, '_').split('.')[0]}`;

        // Upload the image buffer to Cloudinary
        const result = await cloudinary.uploader.upload(
            `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
            {
                folder: 'emailxp_campaign_images', // Optional: folder in Cloudinary
                public_id: uniquePublicId, // Use the generated unique public ID
                overwrite: true, // Allow overwriting if a public_id collision somehow occurs (unlikely with timestamp)
            }
        );

        // Cloudinary returns the secure URL and the public_id of the uploaded image
        const imageUrl = result.secure_url;
        const publicId = result.public_id; // Extract the public_id

        console.log(`Image uploaded to Cloudinary: ${imageUrl}, Public ID: ${publicId}`);

        // IMPORTANT: Return both imageUrl and publicId to the frontend
        res.status(200).json({ imageUrl: imageUrl, publicId: publicId });

    } catch (uploadError) {
        console.error('Error uploading to Cloudinary:', uploadError);
        res.status(500).json({ message: 'Failed to upload image.', error: uploadError.message });
    }
});

// @desc    Delete image from Cloudinary
// @route   DELETE /api/upload/image/:public_id
// @access  Private (requires authentication)
// The public_id should be the full path within Cloudinary, e.g., 'emailxp_campaign_images/12345_my_image'
router.delete('/image/:public_id', protect, async (req, res) => {
    const { public_id } = req.params;

    if (!public_id) {
        res.status(400);
        throw new Error('Public ID for image deletion is required.');
    }

    try {
        // Use cloudinary.uploader.destroy to delete the image by its public_id
        // The public_id sent from the frontend should include the folder path if one was used during upload.
        // For example, if uploaded with folder 'emailxp_campaign_images' and public_id 'my_image',
        // the public_id passed here should be 'emailxp_campaign_images/my_image'.
        const result = await cloudinary.uploader.destroy(public_id);

        // Cloudinary's destroy method returns an object with 'result' property (e.g., 'ok' or 'not found')
        if (result.result === 'ok') {
            console.log(`Image with Public ID ${public_id} deleted successfully from Cloudinary.`);
            res.status(200).json({ message: 'Image deleted successfully.', publicId: public_id });
        } else if (result.result === 'not found') {
            console.warn(`Image with Public ID ${public_id} not found on Cloudinary.`);
            res.status(404).json({ message: 'Image not found for deletion.', publicId: public_id });
        } else {
            console.error(`Cloudinary deletion for ${public_id} failed with result:`, result);
            res.status(500).json({ message: `Failed to delete image with Public ID ${public_id}. Cloudinary result: ${result.result}`, result: result });
        }

    } catch (deleteError) {
        console.error(`Error deleting image from Cloudinary with Public ID ${public_id}:`, deleteError);
        res.status(500).json({ message: 'Failed to delete image from Cloudinary.', error: deleteError.message });
    }
});

module.exports = router;
