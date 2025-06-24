// emailxp/backend/services/emailService.js

const sgMail = require('@sendgrid/mail');
const { convert } = require('html-to-text');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Use the Railway deployment URL as the base for tracking links and pixels
// This should be set in your Railway environment variables
const BACKEND_TRACKING_BASE_URL = process.env.BACKEND_URL || 'https://emailxp-backend-production.up.railway.app';

/**
 * @desc Sends an email using SendGrid.
 * Embeds campaign and subscriber IDs directly into tracking URLs and a pixel.
 */
const sendEmail = async (toEmail, subject, htmlContent, plainTextContent, campaignId, subscriberId) => {
    const log = (...args) => console.log(`[EmailService]`, ...args);
    const errorLog = (...args) => console.error(`[EmailService]`, ...args);
    const warnLog = (...args) => console.warn(`[EmailService]`, ...args);

    log(`Attempting to send email to: ${toEmail}, Subject: "${subject}", Campaign: ${campaignId}`);

    let finalHtmlContent = htmlContent;
    let finalPlainTextContent = plainTextContent;

    // --- 1. Process HTML Content for Tracking ---
    // Inject campaignId and subscriberId into all links (<a> tags) for click tracking
    if (finalHtmlContent) {
        log('Injecting tracking parameters into HTML links...');
        finalHtmlContent = finalHtmlContent.replace(/<a\s+(.*?)href=["']([^"']*)["'](.*?)>/gi, (match, beforeHref, href, afterHref) => {
            // Ensure href is a valid URL or handle relative paths as needed
            let newHref = href;
            const url = new URL(newHref, BACKEND_TRACKING_BASE_URL); // Use base URL for relative paths
            
            // Append tracking parameters
            url.searchParams.set('campaignId', campaignId ? campaignId.toString() : '');
            url.searchParams.set('subscriberId', subscriberId ? subscriberId.toString() : '');

            // Construct a new URL for the click tracking endpoint
            // This will redirect to the original URL after logging the click
            const trackingUrl = `${BACKEND_TRACKING_BASE_URL}/api/track/click?campaignId=${campaignId}&subscriberId=${subscriberId}&redirect=${encodeURIComponent(url.toString())}`;

            return `<a ${beforeHref}href="${trackingUrl}"${afterHref}>`;
        });

        // Inject a 1x1 tracking pixel for open tracking
        // This pixel will hit our /api/track/open endpoint
        const trackingPixel = `<img src="${BACKEND_TRACKING_BASE_URL}/api/track/open?campaignId=${campaignId}&subscriberId=${subscriberId}" width="1" height="1" style="display:none !important; border:0; height:1px; width:1px; margin:0; padding:0;">`;
        finalHtmlContent = finalHtmlContent + trackingPixel;
        log('Tracking pixel injected for open tracking.');
    }


    // --- 2. Process Plain Text Content ---
    // If plain text is empty, try converting HTML
    if (!finalPlainTextContent || finalPlainTextContent.trim() === '') {
        log('Plain text content is empty. Attempting to convert HTML to plain text...');
        try {
            // Use html-to-text to convert, ensuring links are handled if needed (though our HTML links redirect now)
            finalPlainTextContent = convert(finalHtmlContent, {
                wordwrap: 130,
                selectors: [
                    // Skip images including our tracking pixel
                    { selector: 'img', format: 'skip' },
                    // Ensure links are formatted correctly in plain text, without exposing redirect details
                    { selector: 'a', options: { ignoreHref: false, noAnchorUrl: true } } // Keep URL, but not anchor part
                ]
            });

            if (!finalPlainTextContent || finalPlainTextContent.trim() === '') {
                warnLog('HTML-to-text conversion yielded empty result. Using fallback.');
                finalPlainTextContent = subject || 'Email content provided.';
            }
        } catch (convertError) {
            errorLog('Error during HTML-to-text conversion:', convertError);
            finalPlainTextContent = finalHtmlContent.replace(/<[^>]*>/g, '');
            if (!finalPlainTextContent || finalPlainTextContent.trim() === '') {
                warnLog('Fallback plain text also empty. Using default text.');
                finalPlainTextContent = subject || 'Email content provided.';
            }
        }
    }

    // Construct email message (NO custom_args in the SendGrid payload anymore)
    const msg = {
        to: toEmail,
        from: process.env.SENDGRID_SENDER_EMAIL,
        subject: subject,
        html: finalHtmlContent,
        text: finalPlainTextContent,
        // No 'personalizations' array with custom_args here as we are embedding directly
        // If SendGrid API requires 'personalizations' and 'to', keep it simple:
        personalizations: [
            {
                to: [{ email: toEmail }]
            }
        ]
    };

    log(`Message object prepared for SendGrid (to: ${toEmail}, from: ${msg.from}, subject: ${msg.subject})`);
    // Removed logging custom_args here as they are no longer part of SendGrid payload

    if (!msg.text || msg.text.length === 0) {
        errorLog('Plain text content is still empty before sending! Email not sent.');
        return { success: false, message: 'Plain text content is empty, cannot send email.' };
    }

    try {
        await sgMail.send(msg);
        log(`Email sent successfully to ${toEmail}`);
        return { success: true, message: 'Email sent' };
    } catch (error) {
        errorLog(`Error sending email to ${toEmail}:`, error);
        if (error.response) {
            errorLog(`SendGrid detailed error response:`, JSON.stringify(error.response.body, null, 2));
        }
        return { success: false, message: 'Failed to send email', error: error.message };
    }
};

module.exports = {
    sendEmail,
};