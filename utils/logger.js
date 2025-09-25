// emailxp/backend/utils/logger.js

// Determine if the environment is production (e.g., set NODE_ENV=production on Railway)
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Basic logger to control output based on environment
const logger = {
    log: (...args) => {
        // Log general info only in development
        if (!IS_PRODUCTION) {
            console.log(...args);
        }
    },
    info: (...args) => { // Added info level for clarity
        if (!IS_PRODUCTION) {
            console.info(...args);
        }
    },
    debug: (...args) => {
        // Debug-level logs for development only
        if (!IS_PRODUCTION) {
            // Use console.debug if available, fall back to console.log
            (console.debug || console.log)(...args);
        }
    },
    warn: (...args) => {
        // Warnings are often useful in both dev and production
        console.warn(...args);
    },
    error: (...args) => {
        // Errors should always be logged in both dev and production
        console.error(...args);
    }
};

module.exports = logger;