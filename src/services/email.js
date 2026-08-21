const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter;

if (env.smtp.user && env.smtp.pass) {
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: false,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  });
}

async function sendOtpEmail(email, otp) {
  if (!transporter) {
    console.log(`[DEV] OTP for ${email}: ${otp}`);
    return;
  }

  await transporter.sendMail({
    from: `"GeoBuzzer" <${env.smtp.user}>`,
    to: email,
    subject: 'Your GeoBuzzer verification code',
    text: `Your verification code is: ${otp}\n\nThis code expires in 10 minutes.`,
    html: `<h2>Your verification code</h2><p style="font-size:32px;letter-spacing:8px;font-weight:bold">${otp}</p><p>This code expires in 10 minutes.</p>`,
  });
}

module.exports = { sendOtpEmail };
