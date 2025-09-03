// emailxp/backend/utils/resendEmailService.js

const { Resend } = require('resend'); // Import the Resend SDK

// Initialize Resend with your API key from environment variables
const resend = new Resend(process.env.RESEND_API_KEY);

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
    // Default 'from' address if not provided.
    // IMPORTANT: Replace 'onboarding@resend.dev' with your *verified domain* in Resend.
    // For testing, you can use 'onboarding@resend.dev' but for production, use your own domain.
    // Always use a verified from address from env to avoid 403 domain errors
    const verifiedFrom = process.env.EMAIL_FROM || process.env.SENDER_EMAIL || 'onboarding@resend.dev';
    const finalFrom = fromName ? `${fromName} <${verifiedFrom}>` : verifiedFrom;
    const replyTo = (from && from.toLowerCase() !== verifiedFrom.toLowerCase()) ? from : undefined;

    try {
        const payload = {
            from: finalFrom,
            to: to,
            subject: subject,
            html: html,
            text: text || '',
        };
        if (replyTo) payload.reply_to = replyTo;
        const { data, error } = await resend.emails.send(payload);

        if (error) {
            console.error('Error sending email with Resend:', error);
            throw new Error(`Failed to send email: ${error.message || JSON.stringify(error)}`);
        }

        console.log('Email sent successfully with Resend:', data);
        return data; // Returns data like { id: 'email_id' }
    } catch (err) {
        console.error('Caught exception while sending email with Resend:', err);
        throw err; // Re-throw the error for the calling function to handle
    }
};

module.exports = { sendEmail };
