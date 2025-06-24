// emailxp/backend/services/emailService.js

const sgMail = require('@sendgrid/mail');
const { convert } = require('html-to-text'); // Make sure html-to-text is installed (npm install html-to-text)

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// BACKEND_TRACKING_BASE_URL is no longer directly used for embedding,
// but might still be useful for other API calls or reference. Keeping for now.
const BACKEND_TRACKING_BASE_URL = process.env.BACKEND_URL || 'https://emailxp-backend-production.up.railway.app';


/**
 * @desc Sends an email using SendGrid.
 * Includes custom arguments for webhook tracking.
 * Robustly generates plain text content from HTML if not provided.
 * @param {string} toEmail - Recipient's email address.
 * @param {string} subject - Email subject.
 * @param {string} htmlContent - HTML content of the email.
 * @param {string} plainTextContent - Plain text content of the email (optional, will be generated from HTML if empty).
 * @param {string} campaignId - Mongoose ObjectId of the campaign (will be converted to string for SendGrid custom_args).
 * @param {string} subscriberId - Mongoose ObjectId of the subscriber (will be converted to string for SendGrid custom_args).
 * @param {string} listId - Mongoose ObjectId of the list (will be converted to string for SendGrid custom_args).
 * @returns {Promise<{success: boolean, message: string, error?: string}>} - Result of the send operation.
 */
const sendEmail = async (toEmail, subject, htmlContent, plainTextContent, campaignId, subscriberId, listId) => {
    // Use logger if available, otherwise console.log
    const log = (...args) => console.log(`[EmailService]`, ...args);
    const errorLog = (...args) => console.error(`[EmailService]`, ...args);
    const warnLog = (...args) => console.warn(`[EmailService]`, ...args);

    log(`Attempting to send email to: ${toEmail}, Subject: "${subject}", Campaign: ${campaignId}`);

    let finalHtmlContent = htmlContent;
    let finalPlainTextContent = plainTextContent;

    // Generate plainTextContent if it's empty (with robust fallbacks)
    if (!finalPlainTextContent || finalPlainTextContent.trim() === '') {
        log('Plain text content is empty or whitespace. Attempting to convert HTML to plain text...');
        try {
            finalPlainTextContent = convert(finalHtmlContent, {
                wordwrap: 130, // Wrap lines for readability
                selectors: [
                    { selector: 'img', format: 'skip' }, // Skip images in plain text
                    { selector: 'a', options: { ignoreHref: true } } // Don't show full hrefs in plain text version
                ]
            });
            
            // Fallback if conversion results in empty or whitespace
            if (!finalPlainTextContent || finalPlainTextContent.trim() === '') {
                warnLog('WARNING: HTML to plain text conversion yielded empty or whitespace content. Using fallback.');
                finalPlainTextContent = subject || 'Email content provided.'; // Fallback to subject or a generic message
            }
        } catch (convertError) {
            errorLog('ERROR: Error during HTML to plain text conversion:', convertError);
            // Fallback: Strip HTML tags manually if html-to-text fails for some reason
            finalPlainTextContent = finalHtmlContent.replace(/<[^>]*>/g, '');
            // Ensure manual strip also has a fallback
            if (!finalPlainTextContent || finalPlainTextContent.trim() === '') {
                warnLog('WARNING: Manual plain text strip also yielded empty or whitespace. Using fallback.');
                finalPlainTextContent = subject || 'Email content provided.'; // As a last resort
            }
        }
    }

    // CRITICAL: Ensure custom_args are strings for SendGrid
    const msg = {
        to: toEmail,
        from: process.env.SENDGRID_SENDER_EMAIL,
        subject: subject,
        html: finalHtmlContent,
        text: finalPlainTextContent,
        custom_args: {
            campaignId: campaignId ? campaignId.toString() : '',
            subscriberId: subscriberId ? subscriberId.toString() : '',
            listId: listId ? listId.toString() : ''
        }
    };

    log(`Message object prepared for SendGrid (to: ${msg.to}, from: ${msg.from}, subject: ${msg.subject})`);
    log(`Custom Args being sent to SendGrid: `, msg.custom_args); // Crucial log for debugging custom_args

    if (!msg.text || msg.text.length === 0) {
        errorLog('ERROR: Plain text content is still empty just before sending! This indicates an issue with generation.');
        return { success: false, message: 'Plain text content is empty, cannot send email.' };
    }

    try {
        await sgMail.send(msg);
        log(`Email sent successfully to ${toEmail}`);
        return { success: true, message: 'Email sent' };
    } catch (error) {
        errorLog(`FATAL ERROR sending email to ${toEmail}:`, error);
        if (error.response) {
            errorLog(`SendGrid detailed error response body:`, JSON.stringify(error.response.body, null, 2));
        }
        return { success: false, message: 'Failed to send email', error: error.message };
    }
};

module.exports = {
    sendEmail,
};
