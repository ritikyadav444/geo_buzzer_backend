const mongoose = require('mongoose');

const buzzerAlarmSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    radiusMeters: { type: Number, default: 150, min: 50, max: 500 },
  },
  label: { type: String, default: '' },
  tune: { type: String, default: 'default' },
  sequenceGroup: { type: String },
  sequenceOrder: { type: Number },
  status: {
    type: String,
    enum: ['active', 'triggered', 'cancelled'],
    default: 'active',
  },
  createdAt: { type: Date, default: Date.now },
});

buzzerAlarmSchema.index({ owner: 1, status: 1 });
buzzerAlarmSchema.index({ targets: 1, status: 1 });

module.exports = mongoose.model('BuzzerAlarm', buzzerAlarmSchema);
