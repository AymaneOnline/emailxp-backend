// emailxp/backend/utils/resendEmailService.js

const { Resend } = require('resend'); // Import the Resend SDK

// Initialize Resend with your API key from environment variables
const resend = new Resend(process.env.RESEND_API_KEY);

console.log('🔄 RESEND UTIL MODULE LOADED - Using sender:', process.env.EMAIL_FROM || 'onboarding@resend.dev');

/**
 * Sends an email using Resend.
 * @param {Object} options - Email options.
 * @param {string} options.to - Recipient email address.
 * @param {string} options.subject - Email subject.
 * @param {string} options.html - HTML content of the email.
 * @param {string} [options.text] - Plain text content of the email (optional, but recommended).
 * @param {string} [options.from] - Sender email address (e.g., 'onboarding@yourdomain.com').
 * Must be a verified domain in Resend.
 * @param {string} [options.fromName] - Sender name (e.g., 'Your Company Name').
 */
const sendEmail = async ({ to, subject, html, text, from, fromName }) => {
    // Debug logging to track what's being passed
    console.log('DEBUG Resend Util - Received params:', { to, from, fromName });
    
    // If a specific from address supplied (already validated upstream) use it; else fallback to global
    const fallback = process.env.EMAIL_FROM;
    if (!from && !fallback) {
        throw new Error('No FROM available (missing verified domain and EMAIL_FROM)');
    }
    const chosenFrom = from || fallback;
    const finalFrom = fromName ? `${fromName} <${chosenFrom}>` : chosenFrom;
    
    console.log('DEBUG Resend Util - Using finalFrom:', finalFrom);
    
    try {
        const payload = { from: finalFrom, to, subject, html, text: text || '' };
        const { data, error } = await resend.emails.send(payload);

        if (error) {
            console.error('Error sending email with Resend:', error);
            const msg = error.message || JSON.stringify(error);
            const sandbox = msg.includes('only send testing emails') || msg.includes('verify a domain');
            const err = new Error(msg);
            err.sandbox = sandbox;
            throw err;
        }

        console.log('Email sent successfully with Resend:', data);
        return data; // Returns data like { id: 'email_id' }
    } catch (err) {
        console.error('Caught exception while sending email with Resend:', err);
        throw err; // Re-throw the error for the calling function to handle
    }
};

module.exports = { sendEmail };
