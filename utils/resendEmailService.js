// emailxp/backend/utils/resendEmailService.js

const { Resend } = require('resend'); // Import the Resend SDK
// Local email service fallback (nodemailer-based)
const EmailService = require('./emailService');

let resend = null;
if (process.env.RESEND_API_KEY) {
    try {
        resend = new Resend(process.env.RESEND_API_KEY);
    } catch (e) {
        console.warn('Resend client failed to initialize:', e && e.message);
        resend = null;
    }
} else {
    console.warn('RESEND_API_KEY not set — Resend disabled, will fall back to internal EmailService');
}

console.log('🔄 RESEND UTIL MODULE LOADED - Using sender:', process.env.EMAIL_FROM || 'onboarding@resend.dev', 'resendEnabled=', !!resend);

/**
 * Adds an unsubscribe footer to HTML email content
 * @param {string} html - Original HTML content
 * @param {string} subscriberId - Subscriber ID for unsubscribe link
 * @param {string} campaignId - Campaign ID for tracking
 * @returns {string} HTML with unsubscribe footer added
 */
const addUnsubscribeFooter = (html, subscriberId, campaignId) => {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const unsubscribeUrl = `${baseUrl}/api/subscribers/unsubscribe/${subscriberId}${campaignId ? `/${campaignId}` : ''}`;

    const footerHtml = `
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e5e5; text-align: center; font-size: 12px; color: #666;">
            <p>
                You're receiving this email because you subscribed to our mailing list.
                <br>
                <a href="${unsubscribeUrl}" style="color: #666; text-decoration: underline;">Unsubscribe</a>
            </p>
            <p style="margin-top: 10px;">
                Powered by <strong>EmailXP</strong>
            </p>
        </div>
    `;

    // Insert footer before closing body tag, or at the end if no body tag
    if (html.includes('</body>')) {
        return html.replace('</body>', `${footerHtml}</body>`);
    } else {
        return html + footerHtml;
    }
};
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
 * @param {string} [options.subscriberId] - Subscriber ID for unsubscribe footer.
 * @param {string} [options.campaignId] - Campaign ID for unsubscribe tracking.
 */
const sendEmail = async ({ to, subject, html, text, from, fromName, subscriberId, campaignId }) => {
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

    // Add unsubscribe footer if subscriber info is provided
    let finalHtml = html;
    if (subscriberId) {
        finalHtml = addUnsubscribeFooter(html, subscriberId, campaignId);
    }

    // If Resend is available, try to send with it first
    if (resend) {
        try {
            const payload = { from: finalFrom, to, subject, html: finalHtml, text: text || '' };
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
            console.error('Resend send failed, will attempt fallback to EmailService:', err && err.message);

            // If the error indicates an unverified domain / sandbox, annotate and rethrow
            const msg = err && err.message ? err.message : '';
            const sandbox = msg.includes('only send testing emails') || msg.includes('verify a domain');
            if (sandbox) {
                const e = new Error(msg);
                e.sandbox = true;
                throw e;
            }

            // Otherwise fall through to internal EmailService fallback
        }
    }

    // Fallback: use the nodemailer-based EmailService
    try {
        const emailSvc = new EmailService();
        const result = await emailSvc.sendEmail({ to, subject, html: finalHtml, text, from: finalFrom });
        console.log('Email sent via fallback EmailService:', result);
        return result;
    } catch (fallbackErr) {
        console.error('Fallback EmailService failed to send email:', fallbackErr);
        throw fallbackErr;
    }
};

module.exports = { sendEmail };
