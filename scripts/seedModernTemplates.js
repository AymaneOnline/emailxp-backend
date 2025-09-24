// emailxp/backend/scripts/seedModernTemplates.js

const mongoose = require('mongoose');
const { seedModernTemplates } = require('../seeders/modernTemplates');

// Load environment variables
require('dotenv').config();

const runSeeder = async () => {
  try {
    console.log('🚀 Starting modern template seeding process...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✓ Connected to MongoDB');
    
    // Run the seeder
    await seedModernTemplates();
    
    console.log('\n🎉 Modern template seeding completed successfully!');
    console.log('You can now view the new templates in your application.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error running modern template seeder:', error);
    process.exit(1);
  }
};

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n⏹️  Process interrupted');
  mongoose.connection.close(() => {
    process.exit(0);
  });
});

runSeeder();