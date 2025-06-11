// emailxp/backend/routes/templateRoutes.js

const express = require('express');
const router = express.Router();
const {
    createTemplate,
    getTemplates,
    getTemplate,    // <--- NEW: Import getTemplate
    updateTemplate, // <--- NEW: Import updateTemplate
    deleteTemplate  // <--- NEW: Import deleteTemplate
} = require('../controllers/templateController');

// If you have authentication middleware (e.g., protect), import it here:
// const { protect } = require('../middleware/authMiddleware'); // Adjust path as needed

// Routes for /api/templates (GET all, POST create)
// These routes do NOT require an ID in the URL
router.route('/')
    .post(createTemplate) // .post(protect, createTemplate) if authenticated
    .get(getTemplates);   // .get(protect, getTemplates) if authenticated

// Routes for /api/templates/:id (GET by ID, PUT update, DELETE)
// These routes DO require an ID in the URL parameter
router.route('/:id')
    .get(getTemplate)    // .get(protect, getTemplate) if authenticated
    .put(updateTemplate) // .put(protect, updateTemplate) if authenticated
    .delete(deleteTemplate); // .delete(protect, deleteTemplate) if authenticated

module.exports = router;