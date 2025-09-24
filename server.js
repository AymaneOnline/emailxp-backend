// emailxp/backend/server.js

const express = require('express');
const dotenv = require('dotenv').config();
const cors = require('cors');
const { errorHandler } = require('./middleware/errorMiddleware');
const requestId = require('./middleware/requestId');
const emailQueueService = require('./services/emailQueueService');
const connectDB = require('./config/db');
require('./config/cloudinary');

const userRoutes = require('./routes/userRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const groupRoutes = require('./routes/groupRoutes');
const subscriberRoutes = require('./routes/subscriberRoutes');
const fileRoutes = require('./routes/fileRoutes'); // NEW: Import file routes
const segmentRoutes = require('./routes/segments');
const templateRoutes = require('./routes/templates'); // Unified templates routes (auth protected)
const unlayerTemplateRoutes = require('./routes/unlayerTemplates'); // Unlayer API templates
const formRoutes = require('./routes/formRoutes'); // Forms routes
const { startCampaignScheduler } = require('./utils/campaignScheduler');
const { campaignAutomationEngine } = require('./services/campaignAutomation');
const { startBehavioralTriggerScheduler } = require('./utils/behavioralTriggerScheduler');
const { schedulePendingSubscriberCleanup } = require('./utils/pendingSubscriberCleanup');
const cron = require('node-cron');
const { runDomainReverificationBatch } = require('./jobs/domainReverificationJob');

// Avoid connecting to the real database when running Jest tests that use an in-memory server
if (process.env.NODE_ENV !== 'test') {
    connectDB();
}
// Optional index audit (set INDEX_AUDIT=1)
if (process.env.INDEX_AUDIT === '1') {
    const { auditIndexes } = require('./utils/indexAudit');
    // Run after a short delay to allow model index builds
    setTimeout(() => {
        auditIndexes().catch(err => console.error('Index audit failed', err));
    }, 4000);
}

const app = express();
app.set('trust proxy', 1); // Trust the first proxy

// Configure CORS with credentials support
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : 'http://localhost:3000',
  credentials: true
}));

app.use(requestId);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Define API routes
app.use('/api/users', userRoutes); // Auth routes (register, login, profile)
app.use('/api/campaigns', campaignRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/subscribers', subscriberRoutes);
// tags routes removed
app.use('/api/files', fileRoutes); // File routes for general file management
app.use('/api/segments', segmentRoutes);
app.use('/api/advanced-segmentation', require('./routes/advancedSegmentation'));
app.use('/api/audience', require('./routes/audienceRoutes'));
app.use('/api/ab-tests', require('./routes/abTestRoutes'));
app.use('/api/templates', templateRoutes);
app.use('/api/unlayer-templates', unlayerTemplateRoutes);
app.use('/api/forms', formRoutes); // Forms routes
app.use('/api/template-sharing', require('./routes/templateSharing'));
app.use('/api/campaign-schedules', require('./routes/campaignSchedules'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/analytics-events', require('./routes/analyticsEvents'));
app.use('/api/user-management', require('./routes/userManagement')); // Admin user management
app.use('/api/organizations', require('./routes/organizationManagement'));
app.use('/api/track', require('./routes/emailTracking'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/test-email-service', require('./routes/testMailgun'));
app.use('/api/behavioral-triggers', require('./routes/behavioralTriggers'));
app.use('/api/behavioral-events', require('./routes/behavioralEvents'));
app.use('/api/recommendations', require('./routes/recommendations'));
app.use('/api/automations', require('./routes/automationRoutes'));
app.use('/api/landing-pages', require('./routes/landingPageRoutes'));
app.use('/api/sending-domains', require('./routes/domainAuthRoutes'));
app.use('/api/preference-categories', require('./routes/preferenceCategoryRoutes'));
app.use('/api/preferences', require('./routes/preferences'));
app.use('/api/deliverability', require('./routes/deliverability'));
app.use('/api/conversions', require('./routes/conversions'));
app.use('/api/list-health', require('./routes/listHealth'));
app.use('/api/stream', require('./routes/stream'));
app.use('/api/health', require('./routes/healthRoutes'));

// Simple status endpoint for frontend checks
app.get('/api/status', (req, res) => {
        res.status(200).json({ message: 'Backend API is running!', requestId: req.requestId });
});

// Queue stats endpoint (internal monitoring)
app.get('/api/system/queue-stats', async (req, res) => {
    try {
        const stats = await emailQueueService.getQueueStats();
        res.json({ queue: stats, requestId: req.requestId });
    } catch (e) {
        res.status(500).json({ error: e.message, requestId: req.requestId });
    }
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

// Public landing page routes
app.use('/', require('./routes/publicLandingPageRoutes'));

app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    startCampaignScheduler();
    campaignAutomationEngine.start();
    startBehavioralTriggerScheduler();
    schedulePendingSubscriberCleanup();
    // Domain re-verification every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
        try {
            const result = await runDomainReverificationBatch({ limit: 40 });
            if (result.regressions > 0) {
                console.warn('Domain reverification regressions detected', result);
            }
        } catch (e) {
            console.warn('Domain reverification cron failed', e.message);
        }
    });
}

module.exports = app; // export for tests