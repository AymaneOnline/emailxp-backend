const express = require('express');
const router = express.Router();
const formController = require('../controllers/formController');
const { protect } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// Get all forms
router.get('/', formController.getForms);

// Get form by ID
router.get('/:id', formController.getFormById);

// Create a new form
router.post('/', formController.createForm);

// Update form
router.put('/:id', formController.updateForm);

// Delete form
router.delete('/:id', formController.deleteForm);

// Submit form data (public endpoint - no auth required)
router.post('/:id/submit', formController.submitForm);

// Get form submissions
router.get('/:id/submissions', formController.getFormSubmissions);

module.exports = router;