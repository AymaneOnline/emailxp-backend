// emailxp/backend/middleware/errorMiddleware.js

const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    logger && logger.error ? logger.error(err.stack) : console.error(err.stack);
    const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
    // Ensure JSON response and content-type
    res.status(statusCode);
    res.setHeader('Content-Type', 'application/json');
    res.json({
        message: err.message || 'An unknown error occurred',
        stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    });
};

module.exports = {
    errorHandler,
};