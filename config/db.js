// email-marketing-app-backend/config/db.js
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Set global mongoose options to be more permissive with population
        mongoose.set('strictPopulate', false);
        
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            // Modern connection options for Mongoose 8+
            serverSelectionTimeoutMS: 30000, // 30 seconds timeout for server selection
            socketTimeoutMS: 30000, // 30 seconds timeout for socket operations
            connectTimeoutMS: 30000, // 30 seconds timeout for initial connection
            maxPoolSize: 10, // Maximum number of connections in the pool
            minPoolSize: 1, // Minimum number of connections in the pool
            // Removed: bufferMaxEntries and bufferCommands (not supported in newer versions)
        });
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        console.error('MongoDB connection failed. Please check:');
        console.error('1. MongoDB connection string (MONGO_URI)');
        console.error('2. Network connectivity');
        console.error('3. MongoDB Atlas cluster status (if using cloud)');
        process.exit(1); // Exit process with failure
    }
};

module.exports = connectDB;