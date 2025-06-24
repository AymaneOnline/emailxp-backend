// emailxp/backend/services/emailService.js

const sgMail = require('@sendgrid/mail');
const { convert } = require('html-to-text');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const BACKEND_TRACKING_BASE_URL = process.env.BACKEND_URL || 'https://emailxp-backend-production.up.railway.app';

/**
 * @desc Sends an email using SendGrid.
 */
const sendEmail = async (toEmail, subject, htmlContent, plainTextContent, campaignId, subscriberId) => {
    const log = (...args) => console.log(`[EmailService]`, ...args);
    const errorLog = (...args) => console.error(`[EmailService]`, ...args);
    const warnLog = (...args) => console.warn(`[EmailService]`, ...args);

    log(`Attempting to send email to: ${toEmail}, Subject: "${subject}", Campaign: ${campaignId}`);

    let finalHtmlContent = htmlContent;
    let finalPlainTextContent = plainTextContent;

    if (!finalPlainTextContent || finalPlainTextContent.trim() === '') {
        log('Plain text content is empty. Attempting to convert HTML to plain text...');
        try {
            finalPlainTextContent = convert(finalHtmlContent, {
                wordwrap: 130,
                selectors: [
                    { selector: 'img', format: 'skip' },
                    { selector: 'a', options: { ignoreHref: true } }
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

    const msg = {
        from: process.env.SENDGRID_SENDER_EMAIL,
        to: toEmail,
        subject: subject,
        html: finalHtmlContent,
        text: finalPlainTextContent,
        custom_args: {
            campaignId: campaignId ? campaignId.toString() : '',
            subscriberId: subscriberId ? subscriberId.toString() : ''
        }
    };

    log(`Message object prepared for SendGrid (to: ${msg.to}, from: ${msg.from}, subject: ${msg.subject})`);
    log(`Custom Args being sent to SendGrid: `, msg.custom_args);
    log('[EmailService] Final message to SendGrid:', JSON.stringify(msg, null, 2));

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
