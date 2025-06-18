// Add this line AT THE VERY TOP of the file, even before any 'require' statements.
console.log('!!!!!!!!!!! emailService.js FILE HAS BEEN PARSED AND LOADED !!!!!!!!!!!');

const sgMail = require('@sendgrid/mail');
const cheerio = require('cheerio');
const { convert } = require('html-to-text');

// Add this line right after the 'require' statements
console.log('!!!!!!!!!!! All dependencies for emailService.js have been loaded !!!!!!!!!!!');

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

    // --- ADDED LOGS FOR DEBUGGING ---
    console.log('[DEBUG] Entering sendEmail function...');
    console.log(`[DEBUG] Received htmlContent length: ${htmlContent ? htmlContent.length : 'N/A'}`);
    console.log(`[DEBUG] Received plainTextContent length: ${plainTextContent ? plainTextContent.length : 'N/A'}`);
    // --- END ADDED LOGS ---

    let finalHtmlContent = htmlContent;
    if (campaignId && subscriberId) {
        finalHtmlContent = rewriteUrlsForTracking(htmlContent, campaignId, subscriberId);
    }

    const trackingPixelUrl = `${BACKEND_TRACKING_BASE_URL}/api/track/open/${campaignId}/${subscriberId}`;
    const trackingPixel = `<img src="${trackingPixelUrl}" alt="" width="1" height="1" style="display:none !important; min-height:1px; width:1px; border-width:0; margin-top:0; margin-bottom:0; margin-right:0; margin-left:0; padding-top:0; padding-bottom:0; padding-right:0; padding-left:0;" />`;

    finalHtmlContent = finalHtmlContent + trackingPixel;

    // --- NEW LOGIC: Generate plainTextContent if it's empty (with robust logging) ---
    let finalPlainTextContent = plainTextContent;
    console.log(`[DEBUG] Current finalPlainTextContent initially: "${finalPlainTextContent}" (length: ${finalPlainTextContent ? finalPlainTextContent.length : 0})`);

    if (!finalPlainTextContent || finalPlainTextContent.trim() === '') {
        console.log('[DEBUG] plainTextContent is empty or whitespace. Attempting to convert HTML to plain text...');
        try {
            // Ensure html-to-text conversion happens on finalHtmlContent (which includes tracking pixel)
            finalPlainTextContent = convert(finalHtmlContent, {
                wordwrap: 130, // Wrap lines for readability
                selectors: [
                    { selector: 'img', format: 'skip' }, // Skip images in plain text
                    { selector: 'a', options: { ignoreHref: true } } // Don't show full hrefs in plain text version
                ]
            });
            console.log(`[DEBUG] Converted plainTextContent (first 100 chars): "${finalPlainTextContent.substring(0, Math.min(finalPlainTextContent.length, 100))}" (full length: ${finalPlainTextContent.length})`);
        } catch (convertError) {
            console.error('[ERROR] Error during HTML to plain text conversion:', convertError);
            // Fallback: Strip HTML tags manually if html-to-text fails for some reason
            finalPlainTextContent = finalHtmlContent.replace(/<[^>]*>/g, '');
            if (!finalPlainTextContent || finalPlainTextContent.trim() === '') {
                finalPlainTextContent = subject; // As a last resort, use the subject
            }
            console.log('[DEBUG] Used fallback for plainTextContent due to conversion error.');
        }
    } else {
        console.log('[DEBUG] plainTextContent already available, skipping conversion.');
    }
    // --- END NEW LOGIC ---

    console.log(`[DEBUG] Final HTML Content prepared: Yes (length: ${finalHtmlContent.length})`);
    console.log(`[DEBUG] Final Plain Text Content prepared: ${finalPlainTextContent ? 'Yes' : 'No'} (length: ${finalPlainTextContent.length})`);


    const msg = {
        to: toEmail,
        from: process.env.SENDGRID_SENDER_EMAIL, // Corrected env var name
        subject: subject,
        html: finalHtmlContent,
        text: finalPlainTextContent, // Use the potentially generated plain text content
    };

    console.log(`[EmailService] Message object prepared for SendGrid (to: ${msg.to}, from: ${msg.from}, subject: ${msg.subject})`);
    // Add this just before sgMail.send()
    console.log('!!!!!!!!!!! Preparing to send email via SendGrid !!!!!!!!!!!');

    if (!msg.text || msg.text.length === 0) {
        console.error('[EmailService] ERROR: Plain text content is still empty just before sending! This indicates an issue with generation.');
        return { success: false, message: 'Plain text content is empty, cannot send email.' };
    }


    try {
        await sgMail.send(msg);
        console.log(`[EmailService] Email sent successfully to ${toEmail}`);
        return { success: true, message: 'Email sent' };
    } catch (error) {
        console.error(`[EmailService] FATAL ERROR sending email to ${toEmail}:`, error);
        if (error.response) {
            console.error(`[EmailService] SendGrid detailed error response body:`, JSON.stringify(error.response.body, null, 2));
        }
        return { success: false, message: 'Failed to send email', error: error.message };
    }
};

module.exports = {
    sendEmail,
};