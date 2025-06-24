// emailxp/backend/server.js

require('dotenv').config();

// --- DEBUG LOG TO CHECK WEBHOOK SECRET ---
console.log(`[DEBUG - Env Check] SENDGRID_WEBHOOK_SECRET from process.env: "${process.env.SENDGRID_WEBHOOK_SECRET}"`);

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

// --- RAW BODY PARSING FOR SENDGRID WEBHOOK VERIFICATION ---
// This MUST come BEFORE express.json() and other body parsers
app.use('/api/track/webhook', express.raw({ 
  type: 'application/json',
  limit: '10mb'
}));

// General Middleware (applied to all other routes)
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Basic Route
app.get('/', (req, res) => {
  res.send('Email Marketing App Backend is running!');
});

// Use Routes
app.use('/api/users', userRoutes);
app.use('/api/lists', listRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/lists/:listId/subscribers', subscriberRoutes);
app.use('/api/track', trackingRoutes);
app.use('/api/templates', templateRoutes);

// Error Handling Middleware
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startCampaignScheduler();
});