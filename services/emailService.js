const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const EmailLog = require('../models/EmailLog');

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
        EmailLog.create({ to: email, subject: mailOptions.subject, type: 'otp', status: 'sent' }).catch(() => {});
    } catch (err) {
        logger.error('Failed to send OTP email', { email, error: err.message });
        EmailLog.create({ to: email, subject: mailOptions.subject, type: 'otp', status: 'failed', error: err.message }).catch(() => {});
        throw new Error('Failed to send verification email');
    }
}

/**
 * Send a quiz registration receipt email.
 * @param {string} email       - Recipient email
 * @param {object} details     - { quizTitle, amount, startTime, transactionId, participantCount }
 */
async function sendQuizRegistrationEmail(email, details) {
    const { quizTitle, amount, startTime, transactionId, participantCount } = details;
    const formattedStart = startTime
        ? new Date(startTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
        : 'Not scheduled';

    const mailOptions = {
        from: process.env.SMTP_FROM || '"Quiz Arena" <noreply@quizarena.in>',
        to: email,
        subject: `Registration Confirmed — ${quizTitle}`,
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
              <h2 style="margin:0 0 8px;color:#1f2937;font-size:20px;font-weight:600;">Registration Confirmed ✅</h2>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
                You have successfully registered for the quiz. Here are your details:
              </p>
              <!-- Receipt Card -->
              <div style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#374151;">
                  <tr>
                    <td style="padding:8px 0;color:#6b7280;width:40%;">Quiz</td>
                    <td style="padding:8px 0;font-weight:600;">${quizTitle}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;border-top:1px solid #e5e7eb;color:#6b7280;">Amount Paid</td>
                    <td style="padding:8px 0;border-top:1px solid #e5e7eb;font-weight:600;color:#059669;">₹${amount}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;border-top:1px solid #e5e7eb;color:#6b7280;">Starts At</td>
                    <td style="padding:8px 0;border-top:1px solid #e5e7eb;font-weight:600;">${formattedStart}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;border-top:1px solid #e5e7eb;color:#6b7280;">Participants</td>
                    <td style="padding:8px 0;border-top:1px solid #e5e7eb;font-weight:600;">${participantCount}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;border-top:1px solid #e5e7eb;color:#6b7280;">Transaction ID</td>
                    <td style="padding:8px 0;border-top:1px solid #e5e7eb;font-weight:500;font-size:12px;color:#6b7280;">${transactionId}</td>
                  </tr>
                </table>
              </div>
              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.5;">
                Make sure to be online before the quiz starts. Good luck! 🎯
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
        logger.info('Quiz registration email sent', { email, quizTitle });
        EmailLog.create({ to: email, subject: mailOptions.subject, type: 'quiz_registration', status: 'sent', metadata: { quizTitle, amount, transactionId } }).catch(() => {});
    } catch (err) {
        logger.error('Failed to send quiz registration email', { email, error: err.message });
        EmailLog.create({ to: email, subject: mailOptions.subject, type: 'quiz_registration', status: 'failed', error: err.message, metadata: { quizTitle } }).catch(() => {});
    }
}

/**
 * Send a quiz-started notification email.
 * @param {string} email       - Recipient email
 * @param {object} details     - { quizTitle, quizId, duration, totalQuestions }
 */
async function sendQuizStartedEmail(email, details) {
    const { quizTitle, quizId, duration, totalQuestions } = details;
    const durationMinutes = Math.ceil(duration / 60);

    const mailOptions = {
        from: process.env.SMTP_FROM || '"Quiz Arena" <noreply@quizarena.in>',
        to: email,
        subject: `Quiz Started — ${quizTitle} 🚀`,
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
            <td style="background:linear-gradient(135deg,#059669,#10b981);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Quiz Arena</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 8px;color:#1f2937;font-size:20px;font-weight:600;">Your Quiz Has Started! 🚀</h2>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
                The quiz you registered for is now live. Jump in before time runs out!
              </p>
              <!-- Quiz Info -->
              <div style="background-color:#ecfdf5;border:2px solid #059669;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
                <h3 style="margin:0 0 12px;color:#059669;font-size:18px;font-weight:700;">${quizTitle}</h3>
                <p style="margin:0;color:#374151;font-size:14px;">
                  <strong>${totalQuestions}</strong> Questions &nbsp;·&nbsp; <strong>${durationMinutes} min</strong> Duration
                </p>
              </div>
              <div style="text-align:center;margin-bottom:24px;">
                <a href="https://quizarena.in/quizzes/${quizId}" style="display:inline-block;background:linear-gradient(135deg,#059669,#10b981);color:#ffffff;font-weight:600;font-size:16px;padding:14px 32px;border-radius:12px;text-decoration:none;">
                  Start Quiz Now →
                </a>
              </div>
              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.5;text-align:center;">
                Don't miss out — the clock is ticking! ⏳
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
        logger.info('Quiz started email sent', { email, quizTitle });
        EmailLog.create({ to: email, subject: mailOptions.subject, type: 'quiz_started', status: 'sent', metadata: { quizTitle, quizId } }).catch(() => {});
    } catch (err) {
        logger.error('Failed to send quiz started email', { email, error: err.message });
        EmailLog.create({ to: email, subject: mailOptions.subject, type: 'quiz_started', status: 'failed', error: err.message, metadata: { quizTitle } }).catch(() => {});
    }
}

/**
 * Send a quiz-cancelled notification email with refund details.
 * @param {string} email       - Recipient email
 * @param {object} details     - { quizTitle, quizId, refundAmount, reason, participantCount, minParticipants }
 */
async function sendQuizCancelledEmail(email, details) {
    const { quizTitle, refundAmount, reason, participantCount, minParticipants } = details;

    const mailOptions = {
        from: process.env.SMTP_FROM || '"Quiz Arena" <noreply@quizarena.in>',
        to: email,
        subject: `Quiz Cancelled — ${quizTitle}`,
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
            <td style="background:linear-gradient(135deg,#dc2626,#ef4444);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Quiz Arena</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 8px;color:#1f2937;font-size:20px;font-weight:600;">Quiz Cancelled 😔</h2>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
                Unfortunately, the quiz you registered for has been cancelled and your entry fee has been refunded.
              </p>
              <!-- Details Card -->
              <div style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:24px;margin-bottom:24px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#374151;">
                  <tr>
                    <td style="padding:8px 0;color:#6b7280;width:40%;">Quiz</td>
                    <td style="padding:8px 0;font-weight:600;">${quizTitle}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;border-top:1px solid #fecaca;color:#6b7280;">Reason</td>
                    <td style="padding:8px 0;border-top:1px solid #fecaca;font-weight:600;color:#dc2626;">Only ${participantCount}/${minParticipants} participants joined</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;border-top:1px solid #fecaca;color:#6b7280;">Refund Amount</td>
                    <td style="padding:8px 0;border-top:1px solid #fecaca;font-weight:700;color:#059669;font-size:18px;">₹${refundAmount}</td>
                  </tr>
                </table>
              </div>
              <div style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;text-align:center;margin-bottom:24px;">
                <p style="margin:0;color:#059669;font-size:14px;font-weight:600;">
                  ✅ ₹${refundAmount} has been credited back to your wallet
                </p>
              </div>
              <div style="text-align:center;margin-bottom:24px;">
                <a href="https://quizarena.in/quizzes" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#3b82f6);color:#ffffff;font-weight:600;font-size:16px;padding:14px 32px;border-radius:12px;text-decoration:none;">
                  Browse More Quizzes →
                </a>
              </div>
              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.5;text-align:center;">
                Better luck next time! Keep exploring quizzes on Quiz Arena.
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
        logger.info('Quiz cancelled email sent', { email, quizTitle });
        EmailLog.create({ to: email, subject: mailOptions.subject, type: 'quiz_cancelled', status: 'sent', metadata: { quizTitle, refundAmount, reason } }).catch(() => {});
    } catch (err) {
        logger.error('Failed to send quiz cancelled email', { email, error: err.message });
        EmailLog.create({ to: email, subject: mailOptions.subject, type: 'quiz_cancelled', status: 'failed', error: err.message, metadata: { quizTitle } }).catch(() => {});
    }
}

module.exports = { sendOtpEmail, sendQuizRegistrationEmail, sendQuizStartedEmail, sendQuizCancelledEmail };
