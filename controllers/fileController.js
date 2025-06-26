// emailxp/backend/controllers/fileController.js

const asyncHandler = require('express-async-handler');
const cloudinary = require('../config/cloudinary'); // Import configured Cloudinary instance
const File = require('../models/File'); // Import the new File model
const mongoose = require('mongoose'); // Needed for ObjectId type

// @desc    Upload a file to Cloudinary and save its metadata to DB
// @route   POST /api/files/upload
// @access  Private (requires authentication)
const uploadFile = asyncHandler(async (req, res) => {
    // Check if req.file exists (from multer middleware)
    if (!req.file) {
        res.status(400);
        throw new Error('No file provided for upload.');
    }

    // Generate a unique public ID for the image
    // Using a folder prefix helps organize files in Cloudinary
    const folderName = 'emailxp_user_files';
    const publicId = `${folderName}/${Date.now()}_${req.file.originalname.replace(/\s/g, '_').split('.')[0]}`;

    try {
        // Upload the file buffer to Cloudinary
        const result = await cloudinary.uploader.upload(
            `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
            {
                folder: folderName,
                public_id: publicId,
                overwrite: true,
            }
        );

        // Create a new File document in MongoDB
        const file = await File.create({
            user: req.user.id, // Authenticated user's ID
            publicId: result.public_id, // Cloudinary's full public_id (includes folder)
            url: result.secure_url,
            fileName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size,
        });

        res.status(201).json({
            message: 'File uploaded and saved successfully',
            file: {
                _id: file._id,
                publicId: file.publicId,
                url: file.url,
                fileName: file.fileName,
                mimeType: file.mimeType,
                size: file.size,
                createdAt: file.createdAt,
            },
        });

    } catch (uploadError) {
        console.error('Error uploading file to Cloudinary or saving to DB:', uploadError);
        res.status(500).json({ message: 'Failed to upload file.', error: uploadError.message });
    }
});

// @desc    Get all files for the authenticated user
// @route   GET /api/files
// @access  Private (requires authentication)
const getFiles = asyncHandler(async (req, res) => {
    const files = await File.find({ user: req.user.id }).sort({ createdAt: -1 }); // Sort by newest first
    res.status(200).json(files);
});

// @desc    Delete a file from Cloudinary and remove its metadata from DB
// @route   DELETE /api/files/:public_id
// @access  Private (requires authentication)
const deleteFile = asyncHandler(async (req, res) => {
    const publicIdToDelete = req.params.public_id; // public_id from URL parameter

    // Find the file in your database first to ensure ownership
    const file = await File.findOne({ publicId: publicIdToDelete, user: req.user.id });

    if (!file) {
        res.status(404);
        throw new Error('File not found or not authorized to delete this file.');
    }

    try {
        // Delete from Cloudinary
        // Note: The public_id used here must be the full public ID including the folder path.
        // E.g., 'emailxp_user_files/16789012345_image_name'
        const cloudinaryResult = await cloudinary.uploader.destroy(publicIdToDelete);

        if (cloudinaryResult.result === 'ok' || cloudinaryResult.result === 'not found') {
            // If successfully deleted from Cloudinary, or if it was already not found there,
            // proceed to delete from your database.
            await file.deleteOne(); // Use deleteOne on the Mongoose document

            console.log(`File with publicId: ${publicIdToDelete} deleted from Cloudinary and DB.`);
            res.status(200).json({ message: 'File deleted successfully.', publicId: publicIdToDelete });
        } else {
            // Cloudinary deletion failed for some other reason
            console.error(`Cloudinary deletion failed for ${publicIdToDelete}:`, cloudinaryResult);
            res.status(500).json({ message: `Failed to delete file from Cloudinary. Cloudinary result: ${cloudinaryResult.result}` });
        }

    } catch (error) {
        console.error(`Error deleting file from Cloudinary or DB with publicId ${publicIdToDelete}:`, error);
        res.status(500).json({ message: 'Failed to delete file.', error: error.message });
    }
});

module.exports = {
    uploadFile,
    getFiles,
    deleteFile,
};
