// emailxp/backend/routes/templateRoutes.js

const express = require('express');
const router = express.Router();
const { createTemplate, getTemplates } = require('../controllers/templateController');
// If you have authentication middleware (e.g., protect), import it here:
// const { protect } = require('../middleware/authMiddleware'); // Adjust path as needed

// Define template routes
// Apply 'protect' middleware if you want these routes to be restricted to authenticated users
router.route('/').post(createTemplate).get(getTemplates);
// router.route('/').post(protect, createTemplate).get(protect, getTemplates); // Example with authentication

// We'll add routes for specific template IDs (GET by ID, PUT, DELETE) later

module.exports = router;