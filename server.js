// emailxp/backend/server.js

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const userRoutes = require('./routes/userRoutes');
const listRoutes = require('./routes/listRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const subscriberRoutes = require('./routes/subscriberRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const templateRoutes = require('./routes/templateRoutes'); // <--- ADDED: Import template routes

// --- ADDED: Import the campaign scheduler ---
const { startCampaignScheduler } = require('./utils/campaignScheduler');
// --- END ADDED ---

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
app.use('/api/templates', templateRoutes); // <--- ADDED: Use template routes

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
    // --- ADDED: Start the campaign scheduler here ---
    startCampaignScheduler();
    // --- END ADDED ---
});

//add