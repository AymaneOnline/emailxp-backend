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
const templateRoutes = require('./routes/templateRoutes'); 

const { startCampaignScheduler } = require('./utils/campaignScheduler');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to Database
connectDB();

// Middleware
app.use(cors());

// --- MODIFICATION FOR SENDGRID WEBHOOK RAW BODY ---
// This middleware MUST come BEFORE express.json() and express.urlencoded()
// and specifically before the webhook route is hit.
app.use((req, res, next) => {
    if (req.originalUrl === '/api/track/webhook') { // Only apply to webhook route
        let data = '';
        req.on('data', chunk => {
            data += chunk;
        });
        req.on('end', () => {
            req.rawBody = data;
            next();
        });
    } else {
        next();
    }
});
// --- END MODIFICATION ---

app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: false })); // For parsing application/x-www-form-urlencoded

// Basic Route for testing
app.get('/', (req, res) => {
    res.send('Email Marketing App Backend is running!');
});

// Use routes
app.use('/api/users', userRoutes);
app.use('/api/lists', listRoutes);
app.use('/api/campaigns', campaignRoutes);

app.use('/api/lists/:listId/subscribers', subscriberRoutes);

app.use('/api/track', trackingRoutes); // Existing tracking routes, now primarily for webhooks and unsubscribe.
app.use('/api/templates', templateRoutes); // Use template routes

// Error Handling Middleware
app.use((err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode);
    res.json({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startCampaignScheduler();
});