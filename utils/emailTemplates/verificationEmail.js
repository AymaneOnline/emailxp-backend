// emailxp/backend/utils/emailTemplates/verificationEmail.js
// Returns { subject, html, text }

function buildVerificationEmail({ userName, verificationUrl, website }) {
  const brandName = 'EmailXP';
  const primaryColor = '#dc2626'; // Tailwind red-600 approximation
  const bgColor = '#f8f9fb';
  const textColor = '#1f2937';
  const mutedColor = '#6b7280';

  const subject = `${brandName} – Verify your email`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charSet="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${brandName} Email Verification</title>
  <style>
    @media (prefers-color-scheme: dark) {
      body { background:#111827 !important; }
      .card { background:#1f2937 !important; color:#f3f4f6 !important; }
      .muted { color:#9ca3af !important; }
    }
    a.button:hover { background:#b91c1c !important; }
  </style>
</head>
<body style="margin:0;padding:0;background:${bgColor};font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" class="card" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
          <tr>
            <td style="padding:32px 40px 24px 40px;text-align:center;border-bottom:1px solid #f1f5f9;">
              <div style="font-size:28px;font-weight:700;letter-spacing:-0.5px;color:${textColor};">Email<span style="color:${primaryColor};">XP</span></div>
              <div style="font-size:13px;color:${mutedColor};margin-top:4px;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">Account Verification</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px 8px 40px;">
              <h1 style="margin:0;font-size:22px;line-height:1.3;color:${textColor};font-weight:600;">Hi${userName ? ' ' + userName.split(' ')[0] : ''}, verify your email</h1>
              <p style="margin:20px 0 16px 0;font-size:15px;line-height:1.55;color:${mutedColor};">Thanks for creating an account with <strong>${brandName}</strong>. Please confirm this email address so you can start sending, tracking and optimizing your campaigns.</p>
              <div style="text-align:center;margin:32px 0 40px 0;">
                <a class="button" href="${verificationUrl}" clicktracking="off" style="background:${primaryColor};color:#ffffff;display:inline-block;padding:14px 30px;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;letter-spacing:0.3px;">Verify Email Address</a>
              </div>
              <p style="margin:0 0 18px 0;font-size:13px;line-height:1.6;color:${mutedColor};">This link will expire in <strong>1 hour</strong>. If it expires, you can request a new one from your dashboard.</p>
              <p style="margin:0 0 18px 0;font-size:13px;line-height:1.6;color:${mutedColor};">Did you not create an account? You can safely ignore this email—no further action is needed.</p>
              ${website ? `<p style="margin:0 0 18px 0;font-size:13px;line-height:1.6;color:${mutedColor};">Learn more: <a href="${website}" style="color:${primaryColor};text-decoration:none;">${website.replace(/^https?:\/\//,'')}</a></p>` : ''}
              <div style="margin-top:40px;border-top:1px solid #f1f5f9;padding-top:24px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:${mutedColor};">Having trouble with the button? Paste this URL into your browser:</p>
                <p style="word-break:break-all;font-size:11px;color:${primaryColor};margin:8px 0 0 0;">${verificationUrl}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 40px 40px;text-align:center;background:#f9fafb;">
              <p style="margin:0 0 6px 0;font-size:12px;color:${mutedColor};">© ${new Date().getFullYear()} ${brandName}. All rights reserved.</p>
              <p style="margin:0;font-size:11px;color:${mutedColor};">You are receiving this because an account was created using this email address.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Verify your ${brandName} account:\n${verificationUrl}\n\nThis link expires in 1 hour. If you did not create this account, ignore this email.${website ? `\nLearn more: ${website}` : ''}`;

  return { subject, html, text };
}

module.exports = { buildVerificationEmail };
