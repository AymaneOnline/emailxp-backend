// Test MongoDB connection
const mongoose = require('mongoose');
require('dotenv').config();

const testMongoDB = async () => {
  try {
    console.log('Testing MongoDB connection...');
    console.log('MONGO_URI:', process.env.MONGO_URI ? 'Set' : 'Not set');
    
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000, // 5 seconds timeout
    });
    
    console.log('✅ MongoDB connection successful');
    await mongoose.connection.close();
  } catch (error) {
    console.log('❌ MongoDB connection failed:', error.message);
  }
};

testMongoDB();