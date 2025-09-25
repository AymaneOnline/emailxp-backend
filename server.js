// emailxp/backend/server.js

const express = require('express');
const dotenv = require('dotenv').config();
// Normalize FRONTEND_URL: strip trailing slash if present so CORS origin matches
const SANITIZED_FRONTEND_URL = process.env.FRONTEND_URL ? String(process.env.FRONTEND_URL).trim().replace(/\/+$/, '') : undefined;
if (SANITIZED_FRONTEND_URL) {
    process.env.FRONTEND_URL = SANITIZED_FRONTEND_URL;
}
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
// Configure CORS with credentials support and a flexible allowlist.
// Build allowed origins from environment and sensible defaults. This
// helps avoid "Not allowed by CORS" for internal or server-originated
// requests (scheduler, cron jobs, server-to-server calls).
const allowedFromEnv = (process.env.CORS_ALLOW || process.env.ALLOW_ORIGINS || '').split(',').map(s => s && s.trim()).filter(Boolean);
const allowedOrigins = [
    'http://localhost:3000', // Local development
    'https://emailxp-frontend-production.up.railway.app', // Production frontend
    process.env.FRONTEND_URL, // Configured frontend URL
    process.env.BACKEND_URL,  // Allow if backend calls itself or proxies set this
    ...allowedFromEnv
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (curl, server-to-server, native apps)
        if (!origin) return callback(null, true);

        // Allow same-origin requests where origin matches our backend URL
        const serverUrl = (process.env.BACKEND_URL || (process.env.NODE_ENV === 'production' ? undefined : `http://localhost:${process.env.PORT || 5000}`));
        if (serverUrl && origin === serverUrl) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        // Diagnostic log to help debugging blocked origins
        console.warn('[CORS] Blocked origin:', origin, 'Allowed list:', allowedOrigins);
        return callback(new Error('Not allowed by CORS'));
    },
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
// Provide a root route that is safe in both production and development.
// - In production, redirect to FRONTEND_URL (if configured).
// - Otherwise return a small HTML or JSON welcome page.
app.get('/', (req, res) => {
    const frontend = process.env.FRONTEND_URL;

    // Do not perform an automatic redirect. Returning a small HTML page or JSON
    // is safer for debugging and avoids surprising redirects when a client
    // expects API JSON (for example: curl or health checks).
    if (req.accepts('html')) {
        const link = frontend || '/api/status';
        return res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><title>EmailXP Backend</title></head><body><h1>EmailXP Backend API</h1><p>API status: <a href="/api/status">/api/status</a></p><p>Frontend: <a href="${link}">${link}</a></p></body></html>`);
    }

    return res.status(200).json({ message: 'EmailXP Backend API', frontendUrl: frontend || null, requestId: req.requestId });
});

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