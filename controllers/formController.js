const Form = require('../models/Form');
const FormSubmission = require('../models/FormSubmission');
const mongoose = require('mongoose');

// Get all forms
exports.getForms = async (req, res) => {
  try {
    const forms = await Form.find({ createdBy: req.user.id })
      .select('name description fields createdAt updatedAt')
      .lean();
    
    // Add submission count to each form
    const formsWithSubmissionCount = await Promise.all(
      forms.map(async (form) => {
        const submissionCount = await FormSubmission.countDocuments({ form: form._id });
        return { ...form, submissionCount };
      })
    );
    
    res.json({ forms: formsWithSubmissionCount });
  } catch (error) {
    console.error('Error fetching forms:', error);
    res.status(500).json({ message: 'Failed to fetch forms' });
  }
};

// Get form by ID
exports.getFormById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid form ID' });
    }
    
    const form = await Form.findOne({ _id: id, createdBy: req.user.id });
    
    if (!form) {
      return res.status(404).json({ message: 'Form not found' });
    }
    
    res.json(form);
  } catch (error) {
    console.error('Error fetching form:', error);
    res.status(500).json({ message: 'Failed to fetch form' });
  }
};

// Create a new form
exports.createForm = async (req, res) => {
  try {
    const { name, description, fields } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ message: 'Form name is required' });
    }
    
    const form = new Form({
      name,
      description: description || '',
      fields: fields || [],
      createdBy: req.user.id
    });
    
    const savedForm = await form.save();
    res.status(201).json(savedForm);
  } catch (error) {
    console.error('Error creating form:', error);
    res.status(500).json({ message: 'Failed to create form' });
  }
};

// Update form
exports.updateForm = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, fields } = req.body;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid form ID' });
    }
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ message: 'Form name is required' });
    }
    
    const form = await Form.findOneAndUpdate(
      { _id: id, createdBy: req.user.id },
      { name, description: description || '', fields: fields || [] },
      { new: true, runValidators: true }
    );
    
    if (!form) {
      return res.status(404).json({ message: 'Form not found' });
    }
    
    res.json(form);
  } catch (error) {
    console.error('Error updating form:', error);
    res.status(500).json({ message: 'Failed to update form' });
  }
};

// Delete form
exports.deleteForm = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid form ID' });
    }
    
    // Delete the form
    const form = await Form.findOneAndDelete({ _id: id, createdBy: req.user.id });
    
    if (!form) {
      return res.status(404).json({ message: 'Form not found' });
    }
    
    // Also delete all submissions for this form
    await FormSubmission.deleteMany({ form: id });
    
    res.json({ message: 'Form deleted successfully' });
  } catch (error) {
    console.error('Error deleting form:', error);
    res.status(500).json({ message: 'Failed to delete form' });
  }
};

// Submit form data
exports.submitForm = async (req, res) => {
  try {
    const { id } = req.params;
    const formData = req.body;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid form ID' });
    }
    
    // Check if form exists
    const form = await Form.findById(id);
    if (!form) {
      return res.status(404).json({ message: 'Form not found' });
    }
    
    // Create form submission
    const submission = new FormSubmission({
      form: id,
      data: formData,
      userAgent: req.get('User-Agent') || '',
      ipAddress: req.ip || req.connection.remoteAddress || ''
    });
    
    const savedSubmission = await submission.save();
    
    // Update form's updatedAt field
    form.updatedAt = new Date();
    await form.save();
    
    res.status(201).json(savedSubmission);
  } catch (error) {
    console.error('Error submitting form:', error);
    res.status(500).json({ message: 'Failed to submit form' });
  }
};

// Get form submissions
exports.getFormSubmissions = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid form ID' });
    }
    
    // Check if form exists and belongs to user
    const form = await Form.findOne({ _id: id, createdBy: req.user.id });
    if (!form) {
      return res.status(404).json({ message: 'Form not found' });
    }
    
    // Get submissions for this form
    const submissions = await FormSubmission.find({ form: id })
      .sort({ submittedAt: -1 })
      .lean();
    
    res.json({ submissions });
  } catch (error) {
    console.error('Error fetching form submissions:', error);
    res.status(500).json({ message: 'Failed to fetch form submissions' });
  }
};