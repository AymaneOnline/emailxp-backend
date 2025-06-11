// emailxp/backend/server.js

// --- Sentry Integration (MUST BE AT THE VERY TOP) ---
const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');

// It's crucial to use an environment variable for your DSN in production.
// Ensure SENTRY_DSN is set in your Railway environment variables.
const SENTRY_DSN = process.env.SENTRY_DSN; // This will be undefined in dev if not set in .env

Sentry.init({
  dsn: SENTRY_DSN, // Use the DSN from environment variables
  integrations: [
    new ProfilingIntegration(),
    // Add other Sentry integrations here if you are using Express middleware for tracing,
    // like new Sentry.Integrations.Express({ app: app }), but `app` is not defined yet here.
    // These should be added after `app` is defined and used with `app.use()`.
  ],
  // Adjust these values based on your needs and traffic:
  tracesSampleRate: 0.1, // Sample 10% of transactions for performance monitoring
  profilesSampleRate: 0.1, // Sample 10% of profiles for deeper performance insights
  environment: process.env.NODE_ENV || 'development', // Automatically sets to 'production' if on Railway
  // Enable Sentry debug logs only in non-production environments
  debug: process.env.NODE_ENV !== 'production',
});

// --- END Sentry Integration ---

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const userRoutes = require('./routes/userRoutes');
const listRoutes = require('./routes/listRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const subscriberRoutes = require('./routes/subscriberRoutes');
const trackingRoutes = require('./routes/trackingRoutes');

// --- ADDED: Import the campaign scheduler ---
const { startCampaignScheduler } = require('./utils/campaignScheduler');
// --- END ADDED ---

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to Database
connectDB();

// --- Sentry request handler must come before any other middleware or routes ---
// app.use(Sentry.Handlers.requestHandler());
// app.use(Sentry.Handlers.tracingHandler());
// Note: Uncomment these if you want to use Sentry's Express request/tracing handlers.
// If you do, ensure you pass your `app` instance to Sentry.Integrations.Express if you add it.

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

// --- Sentry error handler must come before any other error handling middleware ---
// app.use(Sentry.Handlers.errorHandler());
// Note: Uncomment this if you want Sentry to automatically handle Express errors.

// Error Handling Middleware (Keep this from previous step)
// If you uncomment Sentry.Handlers.errorHandler(), this custom handler should come AFTER it.
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
    console.log('Sentry initialized.'); // Confirm Sentry is initialized
});