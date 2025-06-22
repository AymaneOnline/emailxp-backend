// Add this line AT THE VERY TOP of the file, even before any 'require' statements.
console.log('!!!!!!!!!!! emailService.js FILE HAS BEEN PARSED AND LOADED !!!!!!!!!!!');

const sgMail = require('@sendgrid/mail');
const { convert } = require('html-to-text');

// Add this line right after the 'require' statements
console.log('!!!!!!!!!!! All dependencies for emailService.js have been loaded !!!!!!!!!!!');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const BACKEND_TRACKING_BASE_URL = process.env.BACKEND_URL || 'https://emailxp-backend-production.up.railway.app';

const sendEmail = async (toEmail, subject, htmlContent, plainTextContent, campaignId, subscriberId, listId) => {
    console.log(`[EmailService] Attempting to send email to: ${toEmail}, Subject: "${subject}", Campaign: ${campaignId}`);

    // --- ADDED LOGS FOR DEBUGGING ---
    console.log('[DEBUG] Entering sendEmail function...');
    console.log(`[DEBUG] Received htmlContent length: ${htmlContent ? htmlContent.length : 'N/A'}`);
    console.log(`[DEBUG] Received plainTextContent length: ${plainTextContent ? plainTextContent.length : 'N/A'}`);
    // --- END ADDED LOGS ---

    let finalHtmlContent = htmlContent;

    let finalPlainTextContent = plainTextContent;
    console.log(`[DEBUG] Current finalPlainTextContent initially: "${finalPlainTextContent}" (length: ${finalPlainTextContent ? finalPlainTextContent.length : 0})`);

    if (!finalPlainTextContent || finalPlainTextContent.trim() === '') {
        console.log('[DEBUG] plainTextContent is empty or whitespace. Attempting to convert HTML to plain text...');
        try {
            finalPlainTextContent = convert(finalHtmlContent, {
                wordwrap: 130,
                selectors: [
                    { selector: 'img', format: 'skip' },
                    { selector: 'a', options: { ignoreHref: true } }
                ]
            });
            
            if (!finalPlainTextContent || finalPlainTextContent.trim() === '') {
                console.warn('[EmailService] WARNING: HTML to plain text conversion yielded empty or whitespace content. Using fallback.');
                finalPlainTextContent = subject || 'Email content provided.';
            }
            
            console.log(`[DEBUG] Converted plainTextContent (first 100 chars): "${finalPlainTextContent.substring(0, Math.min(finalPlainTextContent.length, 100))}" (full length: ${finalPlainTextContent.length})`);
        } catch (convertError) {
            console.error('[ERROR] Error during HTML to plain text conversion:', convertError);
            finalPlainTextContent = finalHtmlContent.replace(/<[^>]*>/g, '');
            if (!finalPlainTextContent || finalPlainTextContent.trim() === '') {
                console.warn('[EmailService] WARNING: Manual plain text strip also yielded empty or whitespace. Using fallback.');
                finalPlainTextContent = subject || 'Email content provided.';
            }
            console.log('[DEBUG] Used fallback for plainTextContent due to conversion error.');
        }
    } else {
        console.log('[DEBUG] plainTextContent already available, skipping conversion.');
    }

    console.log(`[DEBUG] Final HTML Content prepared: Yes (length: ${finalHtmlContent.length})`);
    console.log(`[DEBUG] Final Plain Text Content prepared: ${finalPlainTextContent ? 'Yes' : 'No'} (length: ${finalPlainTextContent.length})`);

    // --- CRITICAL CHANGE HERE: Convert Object IDs to strings for SendGrid custom_args ---
    const msg = {
        to: toEmail,
        from: process.env.SENDGRID_SENDER_EMAIL,
        subject: subject,
        html: finalHtmlContent,
        text: finalPlainTextContent,
        custom_args: {
            campaignId: campaignId ? campaignId.toString() : '', // Convert to string, add fallback for robustness
            subscriberId: subscriberId ? subscriberId.toString() : '',
            listId: listId ? listId.toString() : ''
        }
    };

    console.log(`[EmailService] Message object prepared for SendGrid (to: ${msg.to}, from: ${msg.from}, subject: ${msg.subject})`);
    console.log(`[DEBUG] Custom Args being sent to SendGrid: `, msg.custom_args); // New log to verify what's sent
    
    console.log(`[DEBUG] msg.html (first 200 chars): ${msg.html.substring(0, Math.min(msg.html.length, 200))}`);
    console.log(`[DEBUG] msg.text (first 200 chars): ${msg.text.substring(0, Math.min(msg.text.length, 200))}`);
    console.log(`[DEBUG] msg.html length (final): ${msg.html.length}`);
    console.log(`[DEBUG] msg.text length (final): ${msg.text.length}`);
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