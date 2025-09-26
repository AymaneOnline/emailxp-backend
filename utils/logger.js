// emailxp/backend/utils/logger.js

// Determine if the environment is production (e.g., set NODE_ENV=production on Railway)
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Detect test environment (Jest) so we can silence background logs that
// would otherwise throw "Cannot log after tests are done" when running
// asynchronous background verification in tests.
const IS_TEST = process.env.NODE_ENV === 'test' || typeof process.env.JEST_WORKER_ID !== 'undefined';

// Helper to call console methods safely. When running under Jest we don't
// call console at all to avoid BufferedConsole throwing after tests end.
const safeConsoleCall = (fn, ...args) => {
    if (IS_TEST) return; // no-op during tests
    try {
        if (typeof fn === 'function') fn(...args);
    } catch (err) {
        // Swallow any errors from console
    }
};

// Basic logger to control output based on environment
const logger = {
    log: (...args) => {
        // Log general info only in development
        if (!IS_PRODUCTION) {
            safeConsoleCall(console.log, ...args);
        }
    },
    info: (...args) => { // Added info level for clarity
        if (!IS_PRODUCTION) {
            safeConsoleCall(console.info || console.log, ...args);
        }
    },
    debug: (...args) => {
        // Debug-level logs for development only
        if (!IS_PRODUCTION) {
            // Use console.debug if available, fall back to console.log
            safeConsoleCall(console.debug || console.log, ...args);
        }
    },
    warn: (...args) => {
        // Warnings are often useful in both dev and production
        safeConsoleCall(console.warn, ...args);
    },
    error: (...args) => {
        // Errors should always be logged in both dev and production
        safeConsoleCall(console.error, ...args);
    }
};

module.exports = logger;