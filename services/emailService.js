// emailxp/backend/services/emailService.js

const sgMail = require('@sendgrid/mail');
const { convert } = require('html-to-text');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const BACKEND_TRACKING_BASE_URL = process.env.BACKEND_URL || 'https://emailxp-backend-production.up.railway.app';


/**
 * @desc Sends an email using SendGrid.
 */
const sendEmail = async (toEmail, subject, htmlContent, plainTextContent, campaignId, subscriberId, listId) => {
    const log = (...args) => console.log(`[EmailService]`, ...args);
    const errorLog = (...args) => console.error(`[EmailService]`, ...args);
    const warnLog = (...args) => console.warn(`[EmailService]`, ...args);

    log(`Attempting to send email to: ${toEmail}, Subject: "${subject}", Campaign: ${campaignId}`);

    let finalHtmlContent = htmlContent;
    let finalPlainTextContent = plainTextContent;

    if (!finalPlainTextContent || finalPlainTextContent.trim() === '') {
        log('Plain text content is empty or whitespace. Attempting to convert HTML to plain text...');
        try {
            finalPlainTextContent = convert(finalHtmlContent, {
                wordwrap: 130,
                selectors: [
                    { selector: 'img', format: 'skip' },
                    { selector: 'a', options: { ignoreHref: true } }
                ]
            });
            
            if (!finalPlainTextContent || finalPlainTextContent.trim() === '') {
                warnLog('WARNING: HTML to plain text conversion yielded empty or whitespace content. Using fallback.');
                finalPlainTextContent = subject || 'Email content provided.';
            }
        } catch (convertError) {
            errorLog('ERROR: Error during HTML to plain text conversion:', convertError);
            finalPlainTextContent = finalHtmlContent.replace(/<[^>]*>/g, '');
            if (!finalPlainTextContent || finalPlainTextContent.trim() === '') {
                warnLog('WARNING: Manual plain text strip also yielded empty or whitespace. Using fallback.');
                finalPlainTextContent = subject || 'Email content provided.';
            }
        }
    }

    const msg = {
        to: toEmail,
        from: process.env.SENDGRID_SENDER_EMAIL,
        subject: subject,
        html: finalHtmlContent,
        text: finalPlainTextContent,
        custom_args: {
            campaignId: campaignId ? campaignId.toString() : '',
            subscriberId: subscriberId ? subscriberId.toString() : '',
            listId: listId ? listId.id.toString() : '' // Ensure listId is correctly converted from a Mongoose object
        }
    };

    log(`Message object prepared for SendGrid (to: ${msg.to}, from: ${msg.from}, subject: ${msg.subject})`);
    log(`Custom Args being sent to SendGrid: `, msg.custom_args);
    
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