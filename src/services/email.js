const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter;

if (env.smtp.user && env.smtp.pass) {
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

async function sendOtpEmail(email, otp) {
  if (!transporter) {
    console.log(`[DEV] OTP for ${email}: ${otp}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: `"GeoBuzzer" <${env.smtp.user}>`,
      to: email,
      subject: 'Your GeoBuzzer verification code',
      text: `Your verification code is: ${otp}\n\nThis code expires in 10 minutes.`,
      html: `<h2>Your verification code</h2><p style="font-size:32px;letter-spacing:8px;font-weight:bold">${otp}</p><p>This code expires in 10 minutes.</p>`,
    });
    console.log(`OTP email sent to ${email}`);
  } catch (err) {
    console.error(`Failed to send OTP email to ${email}:`, err.message);
  }
}

module.exports = { sendOtpEmail };
