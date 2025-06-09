const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendEmail = async (toEmail, subject, htmlContent, plainTextContent) => {
    const msg = {
        to: toEmail, // Recipient email address
        from: process.env.SENDER_EMAIL, // Your verified sender email
        subject: subject,
        html: htmlContent,
        text: plainTextContent, // Plain text version for email clients that don't support HTML
    };

    try {
        await sgMail.send(msg);
        console.log(`Email sent successfully to ${toEmail}`);
        return { success: true, message: 'Email sent' };
    } catch (error) {
        console.error(`Error sending email to ${toEmail}:`, error);
        if (error.response) {
            console.error(error.response.body); // Log detailed SendGrid error
        }
        return { success: false, message: 'Failed to send email', error: error.message };
    }
};

module.exports = {
    sendEmail,
};