const mongoose = require('mongoose');

const triggerLogSchema = new mongoose.Schema({
  alarmId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuzzerAlarm', required: true },
  triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model('TriggerLog', triggerLogSchema);
