// emailxp/backend/scripts/seedTemplates.js

const mongoose = require('mongoose');
const { seedTemplates } = require('../seeders/templateSeeder');

// Load environment variables
require('dotenv').config();

const runSeeder = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    // Run the seeder
    await seedTemplates();
    
    console.log('Template seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error running template seeder:', error);
    process.exit(1);
  }
};

runSeeder();