const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: false,
    },
});

/**
 * Send an OTP verification email.
 * @param {string} email - Recipient email
 * @param {string} otp   - 6-digit OTP code
 */
async function sendOtpEmail(email, otp) {
    const mailOptions = {
        from: process.env.SMTP_FROM || '"Quiz Arena" <noreply@quizarena.in>',
        to: email,
        subject: 'Verify your Quiz Arena account',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#3b82f6);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Quiz Arena</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 8px;color:#1f2937;font-size:20px;font-weight:600;">Verify your email</h2>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
                Use the code below to complete your registration. This code expires in <strong>5 minutes</strong>.
              </p>
              <!-- OTP Box -->
              <div style="background-color:#f0f4ff;border:2px dashed #4f46e5;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
                <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#4f46e5;">${otp}</span>
              </div>
              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.5;">
                If you didn't request this code, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                &copy; ${new Date().getFullYear()} Quiz Arena. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        logger.info('OTP email sent', { email });
    } catch (err) {
        logger.error('Failed to send OTP email', { email, error: err.message });
        throw new Error('Failed to send verification email');
    }
}

module.exports = { sendOtpEmail };
