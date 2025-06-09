require('dotenv').config();

// --- TEMPORARY DEBUGGING LOGS (REMOVE AFTER FIXING) ---
console.log("--- Railway Environment Variables Check ---");
console.log("MONGO_URI:", process.env.MONGO_URI);
console.log("SENDGRID_API_KEY:", process.env.SENDGRID_API_KEY);
console.log("SENDER_EMAIL:", process.env.SENDER_EMAIL);
console.log("JWT_SECRET:", process.env.JWT_SECRET);
console.log("PORT:", process.env.PORT);
console.log("BACKEND_URL:", process.env.BACKEND_URL);
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("--- End Environment Variables Check ---");
// --- END TEMPORARY DEBUGGING LOGS ---

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const userRoutes = require('./routes/userRoutes');
const listRoutes = require('./routes/listRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const subscriberRoutes = require('./routes/subscriberRoutes');
const trackingRoutes = require('./routes/trackingRoutes'); // Already added in previous step

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to Database
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Basic Route for testing
app.get('/', (req, res) => {
    res.send('Email Marketing App Backend is running!');
});

// Use routes
app.use('/api/users', userRoutes);
app.use('/api/lists', listRoutes);
app.use('/api/campaigns', campaignRoutes);

// --- NEW: Add the subscriber routes, nested under /api/lists/:listId
app.use('/api/lists/:listId/subscribers', subscriberRoutes);
// --- END NEW

app.use('/api/track', trackingRoutes); // Existing new tracking routes

// Error Handling Middleware (Keep this from previous step)
app.use((err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode);
    res.json({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});