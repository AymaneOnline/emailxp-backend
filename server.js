// emailxp/backend/server.js

const express = require('express');
const dotenv = require('dotenv').config();
const cors = require('cors');
const { errorHandler } = require('./middleware/errorMiddleware');
const connectDB = require('./config/db');
require('./config/cloudinary');

const userRoutes = require('./routes/userRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const groupRoutes = require('./routes/groupRoutes');
const subscriberRoutes = require('./routes/subscriberRoutes');
const tagRoutes = require('./routes/tagRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
// const uploadRoutes = require('./routes/uploadRoutes'); // We will replace this with new file routes for general files
const fileRoutes = require('./routes/fileRoutes'); // NEW: Import file routes
const segmentRoutes = require('./routes/segments');
const templateRoutes = require('./routes/templates'); // Unified templates routes (auth protected)
const { startEmailWorker } = require('./utils/emailQueue');
const { startTagCleanupService } = require('./services/tagCleanupService');
const { startCampaignScheduler } = require('./utils/campaignScheduler');
const { campaignAutomationEngine } = require('./services/campaignAutomation');

connectDB();

const app = express();
app.set('trust proxy', 1); // Trust the first proxy
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Define API routes
app.use('/api/users', userRoutes); // Auth routes (register, login, profile)
app.use('/api/campaigns', campaignRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/subscribers', subscriberRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/track', trackingRoutes);
// app.use('/api/upload', uploadRoutes); // Replaced by more general file routes
app.use('/api/files', fileRoutes); // NEW: Use file routes for general file management
app.use('/api/segments', segmentRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/template-sharing', require('./routes/templateSharing'));
app.use('/api/campaign-schedules', require('./routes/campaignSchedules'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/user-management', require('./routes/userManagement')); // Admin user management
app.use('/api/organizations', require('./routes/organizationManagement'));
app.use('/api/track', require('./routes/emailTracking'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/test-mailgun', require('./routes/testMailgun'));

// Simple status endpoint for frontend checks
app.get('/api/status', (req, res) => {
    res.status(200).json({ message: 'Backend API is running!' });
});

// Test endpoint for subscribers
app.get('/api/subscribers/test', (req, res) => {
    res.status(200).json({ message: 'Subscriber API is working' });
});

// Test endpoint for groups
app.get('/api/groups/test', (req, res) => {
    res.status(200).json({ message: 'Group API is working' });
});

// Serve frontend (if applicable, for Railway this is usually separate)
if (process.env.NODE_ENV === 'production') {
    // ...
} else {
    // This is only for local dev if you run backend on root
    app.get('/', (req, res) => res.status(200).json({ message: 'Welcome to the EmailXP Backend API' }));
}

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
startEmailWorker();
startTagCleanupService(); // Start automatic tag cleanup service
startCampaignScheduler(); // Start campaign scheduler for processing scheduled campaigns
campaignAutomationEngine.start(); // Start campaign automation engine
