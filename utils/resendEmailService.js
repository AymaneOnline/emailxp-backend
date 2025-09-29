// emailxp/backend/utils/resendEmailService.js

const { Resend } = require('resend'); // Import the Resend SDK
// Local email service fallback (nodemailer-based). The module exports an instance
// (module.exports = new EmailService()), so require() returns the instance.
const emailServiceInstance = require('./emailService');

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
    const baseUrl = (process.env.BACKEND_URL || process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');
    const unsubscribeUrl = `${baseUrl}/api/subscribers/unsubscribe/${encodeURIComponent(subscriberId)}${campaignId ? `/${encodeURIComponent(campaignId)}` : ''}`;
    // If the template already contains an unsubscribe link or footer text, don't add another.
    // Check for common markers: the {{unsubscribeUrl}} placeholder, explicit '/unsubscribe' links,
    // or the common English footer sentence.
    try {
        const lc = (html || '').toLowerCase();
        if (!lc) return html;

        const hasToken = lc.includes('{{unsubscribeurl}}');
        const hasHref = /href\s*=/.test(lc);
        const hasUnsubscribePath = lc.includes('/unsubscribe');
        const hasFooterPhrase = lc.includes('you are receiving this email because') || lc.includes('you are receiving this email');

        // If template explicitly has a token or any href or direct /unsubscribe path, assume it already has a working link and do nothing
        if (hasToken || hasHref || hasUnsubscribePath) {
            return html;
        }

        // If it mentions the common footer phrase but doesn't include a link/token, try to convert a nearby 'Unsubscribe' plain text into a link
        if (hasFooterPhrase) {
            try {
                // Find the footer phrase and up to 400 chars following it
                const footerMatch = /you are receiving this email because[\s\S]{0,400}/i.exec(html);
                if (footerMatch) {
                    const region = footerMatch[0];
                    if (/unsubscribe/i.test(region)) {
                        const replacedRegion = region.replace(/\b(Unsubscribe)\b/i, `<a href="${unsubscribeUrl}">Unsubscribe</a>`);
                        return html.replace(region, replacedRegion);
                    }
                }
            } catch (e2) {
                console.warn('[ResendUtil] failed to convert footer Unsubscribe into link', e2 && e2.message);
            }
            // If we couldn't convert, fall through to append our footer as a safe fallback
        }
    } catch (e) {
        // If any issue checking, fall back to appending footer (safe default)
        console.warn('[ResendUtil] failed to inspect HTML for existing unsubscribe footer', e && e.message);
    }

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
const sendEmail = async ({ to, subject, html, text, from, fromName, subscriberId, campaignId, templateDisableAutoFooter = false }) => {
    // Debug logging to track what's being passed
    console.log('DEBUG Resend Util - Received params:', { to, from, fromName, templateDisableAutoFooter });
    
    // If a specific from address supplied (already validated upstream) use it; else fallback to global
    const fallback = process.env.EMAIL_FROM;
    if (!from && !fallback) {
        throw new Error('No FROM available (missing verified domain and EMAIL_FROM)');
    }
    const chosenFrom = from || fallback;
    const finalFrom = fromName ? `${fromName} <${chosenFrom}>` : chosenFrom;
    
    console.log('DEBUG Resend Util - Using finalFrom:', finalFrom);

    // Prepare finalHtml and ensure any {{unsubscribeUrl}} tokens are replaced with a working link.
    // We try to preserve authored anchor tags and avoid nested anchors.
    let finalHtml = html || '';
    if (subscriberId) {
    const baseUrl = (process.env.BACKEND_URL || process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');
    const unsubscribeUrl = `${baseUrl}/api/subscribers/unsubscribe/${encodeURIComponent(subscriberId)}${campaignId ? `/${encodeURIComponent(campaignId)}` : ''}`;

        try {
            // Normalize common encoded token patterns first
            finalHtml = finalHtml.replace(/%7B%7B\s*unsubscribeUrl\s*%7D%7D/gi, '{{unsubscribeUrl}}');

            // If the href attribute uses the token directly (href="{{unsubscribeUrl}}"), replace href with real URL first
            finalHtml = finalHtml.replace(/href\s*=\s*(?:"|')\s*\{\{\s*unsubscribeUrl\s*\}\}\s*(?:"|')/gi, `href="${unsubscribeUrl}"`);

            // If the template authored an <a>{{unsubscribeUrl}}</a> replace the inner token with a proper href
            finalHtml = finalHtml.replace(/<a([^>]*)>\s*\{\{\s*unsubscribeUrl\s*\}\}\s*<\/a>/gi, (match, attrs) => {
                // Remove any existing href attribute in attrs to avoid duplicate hrefs
                const cleanedAttrs = (attrs || '').replace(/\s*href\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
                return `<a${cleanedAttrs} href="${unsubscribeUrl}" aria-label="unsubscribe">Unsubscribe</a>`;
            });

            // Replace any remaining raw {{unsubscribeUrl}} tokens with a clickable Unsubscribe link
            finalHtml = finalHtml.replace(/\{\{\s*unsubscribeUrl\s*\}\}/gi, `<a href="${unsubscribeUrl}" aria-label="unsubscribe">Unsubscribe</a>`);
        } catch (e) {
            console.warn('[ResendUtil] failed to replace unsubscribe token:', e && e.message);
        }
    }

    // Add unsubscribe footer if subscriber info is provided and template does not opt-out
    if (subscriberId && !templateDisableAutoFooter) {
        finalHtml = addUnsubscribeFooter(finalHtml, subscriberId, campaignId);
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
        // emailServiceInstance is an instance with sendEmail()
        const result = await emailServiceInstance.sendEmail({ to, subject, html: finalHtml, text, from: finalFrom, subscriberId, campaignId });
        console.log('Email sent via fallback EmailService:', result);
        return result;
    } catch (fallbackErr) {
        console.error('Fallback EmailService failed to send email:', fallbackErr);
        throw fallbackErr;
    }
};

module.exports = { sendEmail };
