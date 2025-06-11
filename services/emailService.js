const sgMail = require('@sendgrid/mail');
const cheerio = require('cheerio'); // A fast, flexible, and lean implementation of core jQuery specifically for the server.
                                     // Install with: npm install cheerio

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// IMPORTANT: Define your backend's base URL for tracking.
// This should be the URL where your tracking routes are accessible.
// Make sure this matches your deployed backend URL.
const BACKEND_TRACKING_BASE_URL = process.env.BACKEND_URL || 'https://emailxp-backend-production.up.railway.app';


/**
 * Rewrites URLs in HTML content to include click tracking.
 * @param {string} htmlContent The original HTML content of the email.
 * @param {string} campaignId The ID of the campaign.
 * @param {string} subscriberId The ID of the subscriber (or a unique identifier for the recipient).
 * @returns {string} The HTML content with rewritten URLs.
 */
const rewriteUrlsForTracking = (htmlContent, campaignId, subscriberId) => {
    // ADDED LOG: Confirm this function is being called
    console.log(`[EmailService] Rewriting URLs for campaign: ${campaignId}, subscriber: ${subscriberId}`);
    const $ = cheerio.load(htmlContent); // Load HTML into Cheerio for easy parsing

    // Find all <a> tags
    $('a').each((index, element) => {
        const originalHref = $(element).attr('href');

        // Only rewrite if it's a valid HTTP/HTTPS link and not already a tracking link (to prevent double-rewriting)
        if (originalHref && (originalHref.startsWith('http://') || originalHref.startsWith('https://')) && !originalHref.includes('/api/track/click')) {
            // Encode the original URL so it can be passed as a query parameter
            const encodedOriginalUrl = encodeURIComponent(originalHref);

            // Construct the tracking URL
            // Ensure campaignId and subscriberId are valid to avoid issues.
            // Using a template literal for clean URL construction
            const trackingUrl = `${BACKEND_TRACKING_BASE_URL}/api/track/click/${campaignId}/${subscriberId}?url=${encodedOriginalUrl}`;

            // Set the new href on the <a> tag
            $(element).attr('href', trackingUrl);
            console.log(`[EmailService] Rewritten link from ${originalHref} to ${trackingUrl}`);
        }
    });

    return $.html(); // Return the modified HTML
};


const sendEmail = async (toEmail, subject, htmlContent, plainTextContent, campaignId, subscriberId) => {
    // ADDED LOG: Log initial parameters before sending
    console.log(`[EmailService] Attempting to send email to: ${toEmail}, Subject: "${subject}", Campaign: ${campaignId}`);

    // --- NEW: Rewrite URLs before sending ---
    let finalHtmlContent = htmlContent;
    if (campaignId && subscriberId) { // Only rewrite if tracking IDs are provided
        finalHtmlContent = rewriteUrlsForTracking(htmlContent, campaignId, subscriberId);
    }
    // --- END NEW ---

    // --- NEW: Add tracking pixel for open tracking ---
    const trackingPixelUrl = `${BACKEND_TRACKING_BASE_URL}/api/track/open/${campaignId}/${subscriberId}`;
    const trackingPixel = `<img src="${trackingPixelUrl}" alt="" width="1" height="1" style="display:none !important; min-height:1px; width:1px; border-width:0; margin-top:0; margin-bottom:0; margin-right:0; margin-left:0; padding-top:0; padding-bottom:0; padding-right:0; padding-left:0;" />`;

    // Append the tracking pixel to the HTML content
    finalHtmlContent = finalHtmlContent + trackingPixel;
    // --- END NEW ---


    const msg = {
        to: toEmail, // Recipient email address
        from: process.env.SENDER_EMAIL, // Your verified sender email
        subject: subject,
        html: finalHtmlContent, // Use the modified HTML content
        text: plainTextContent, // Plain text version for email clients that don't support HTML
    };

    // ADDED LOG: Log the message object before sending (exclude API key)
    console.log(`[EmailService] Message object prepared (to: ${msg.to}, from: ${msg.from}, subject: ${msg.subject})`);

    try {
        await sgMail.send(msg);
        console.log(`[EmailService] Email sent successfully to ${toEmail}`);
        return { success: true, message: 'Email sent' };
    } catch (error) {
        // UPDATED LOG: More descriptive FATAL ERROR log and ensure full error object is logged
        console.error(`[EmailService] FATAL ERROR sending email to ${toEmail}:`, error); 
        if (error.response) {
            // UPDATED LOG: Ensure detailed SendGrid error response body is logged if available
            console.error(`[EmailService] SendGrid detailed error response body:`, error.response.body); 
        }
        return { success: false, message: 'Failed to send email', error: error.message };
    }
};

module.exports = {
    sendEmail,
    // You might want to export rewriteUrlsForTracking if it's reused elsewhere,
    // but for now, keeping it internal to this file for clarity.
};