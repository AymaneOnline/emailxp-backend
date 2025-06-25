// emailxp/backend/middleware/errorMiddleware.js

const errorHandler = (err, req, res, next) => {
    // Determine status code: If a status code is set by the error, use it; otherwise, default to 500 (Server Error)
    const statusCode = res.statusCode ? res.statusCode : 500;

    res.status(statusCode);

    res.json({
        message: err.message,
        // In development, include stack trace for debugging; in production, hide it.
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};

module.exports = {
    errorHandler,
};