// emailxp/backend/routes/fileRoutes.js

const express = require('express');
const multer = require('multer');
const { protect } = require('../middleware/authMiddleware'); // Import your authentication middleware
const {
    uploadFile,
    getFiles,
    deleteFile
} = require('../controllers/fileController'); // Import file controller functions

const router = express.Router();

// Configure multer for memory storage for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB file size limit (adjust as needed for your application)
});

// @route   POST /api/files/upload
// @desc    Upload a single file
// @access  Private
router.post('/upload', protect, upload.single('file'), uploadFile);

// @route   GET /api/files
// @desc    Get all files for the authenticated user
// @access  Private
router.get('/', protect, getFiles);

// @route   DELETE /api/files/:public_id
// @desc    Delete a file by its Cloudinary public ID
// @access  Private
// IMPORTANT: The public_id here is the full Cloudinary public ID, including the folder (e.g., emailxp_user_files/image_name_timestamp)
router.delete('/:public_id', protect, deleteFile);


module.exports = router;
