// emailxp/backend/scripts/seedAdvancedTemplates.js

const mongoose = require('mongoose');
const { seedAdvancedTemplates } = require('../seeders/advancedTemplates');

// Load environment variables
require('dotenv').config();

const runSeeder = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    
    console.log('Connected to MongoDB');
    
    // Run the seeder
    await seedAdvancedTemplates();
    
    console.log('Advanced template seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error running advanced template seeder:', error);
    process.exit(1);
  }
};

runSeeder();