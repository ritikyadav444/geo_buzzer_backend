const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, default: '' },
  passwordHash: { type: String, required: true },
  isEmailVerified: { type: Boolean, default: false },
  otp: { type: String },
  otpExpiry: { type: Date },
  refreshToken: { type: String },
  fcmToken: { type: String },
  createdAt: { type: Date, default: Date.now },
});

userSchema.index({ email: 1 });
userSchema.index({ username: 1 });

module.exports = mongoose.model('User', userSchema);
