const sgMail = require('@sendgrid/mail');
const cheerio = require('cheerio');
const { convert } = require('html-to-text'); // <--- ADD THIS LINE

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const BACKEND_TRACKING_BASE_URL = process.env.BACKEND_URL || 'https://emailxp-backend-production.up.railway.app';


/**
 * Rewrites URLs in HTML content to include click tracking.
 * @param {string} htmlContent The original HTML content of the email.
 * @param {string} campaignId The ID of the campaign.
 * @param {string} subscriberId The ID of the subscriber (or a unique identifier for the recipient).
 * @returns {string} The HTML content with rewritten URLs.
 */
const rewriteUrlsForTracking = (htmlContent, campaignId, subscriberId) => {
    console.log(`[EmailService] Rewriting URLs for campaign: ${campaignId}, subscriber: ${subscriberId}`);
    const $ = cheerio.load(htmlContent);

    $('a').each((index, element) => {
        const originalHref = $(element).attr('href');

        if (originalHref && (originalHref.startsWith('http://') || originalHref.startsWith('https://')) && !originalHref.includes('/api/track/click')) {
            const encodedOriginalUrl = encodeURIComponent(originalHref);
            const trackingUrl = `${BACKEND_TRACKING_BASE_URL}/api/track/click/${campaignId}/${subscriberId}?url=${encodedOriginalUrl}`;
            $(element).attr('href', trackingUrl);
            console.log(`[EmailService] Rewritten link from ${originalHref} to ${trackingUrl}`);
        }
    });

    return $.html();
};


const sendEmail = async (toEmail, subject, htmlContent, plainTextContent, campaignId, subscriberId) => {
    console.log(`[EmailService] Attempting to send email to: ${toEmail}, Subject: "${subject}", Campaign: ${campaignId}`);

    let finalHtmlContent = htmlContent;
    if (campaignId && subscriberId) {
        finalHtmlContent = rewriteUrlsForTracking(htmlContent, campaignId, subscriberId);
    }

    const trackingPixelUrl = `${BACKEND_TRACKING_BASE_URL}/api/track/open/${campaignId}/${subscriberId}`;
    const trackingPixel = `<img src="${trackingPixelUrl}" alt="" width="1" height="1" style="display:none !important; min-height:1px; width:1px; border-width:0; margin-top:0; margin-bottom:0; margin-right:0; margin-left:0; padding-top:0; padding-bottom:0; padding-right:0; padding-left:0;" />`;

    finalHtmlContent = finalHtmlContent + trackingPixel;

    // --- NEW LOGIC: Generate plainTextContent if it's empty ---
    let finalPlainTextContent = plainTextContent;
    if (!finalPlainTextContent || finalPlainTextContent.trim() === '') {
        // Convert HTML to plain text using html-to-text
        finalPlainTextContent = convert(finalHtmlContent, {
            wordwrap: 130, // Wrap lines for readability
            selectors: [
                { selector: 'img', format: 'skip' }, // Skip images in plain text
                { selector: 'a', options: { ignoreHref: true } } // Don't show full hrefs in plain text version
            ]
        });
        // Fallback in case conversion yields nothing useful
        if (!finalPlainTextContent || finalPlainTextContent.trim() === '') {
            finalPlainTextContent = subject; // As a last resort, use the subject
        }
        console.log(`[EmailService] Generated plainTextContent: "${finalPlainTextContent.substring(0, 100)}..."`);
    }
    // --- END NEW LOGIC ---

    const msg = {
        to: toEmail,
        from: process.env.SENDGRID_SENDER_EMAIL, // <--- FIXED THIS: Changed to SENDGRID_SENDER_EMAIL
        subject: subject,
        html: finalHtmlContent,
        text: finalPlainTextContent, // <--- USE THIS: Use the potentially generated plain text content
    };

    console.log(`[EmailService] Message object prepared (to: ${msg.to}, from: ${msg.from}, subject: ${msg.subject})`);

    try {
        await sgMail.send(msg);
        console.log(`[EmailService] Email sent successfully to ${toEmail}`);
        return { success: true, message: 'Email sent' };
    } catch (error) {
        console.error(`[EmailService] FATAL ERROR sending email to ${toEmail}:`, error);
        if (error.response) {
            console.error(`[EmailService] SendGrid detailed error response body:`, error.response.body);
        }
        return { success: false, message: 'Failed to send email', error: error.message };
    }
};

module.exports = {
    sendEmail,
};