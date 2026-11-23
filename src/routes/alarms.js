const express = require('express');
const BuzzerAlarm = require('../models/BuzzerAlarm');
const TriggerLog = require('../models/TriggerLog');
const Connection = require('../models/Connection');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();
router.use(authMiddleware);

router.post('/', validate(['targets', 'location']), async (req, res) => {
  try {
    const { targets, location, label, tune, sequenceGroup, sequenceOrder } = req.body;

    if (!Array.isArray(targets) || targets.length === 0) {
      return res.status(400).json({ error: 'targets must be a non-empty array' });
    }
    if (!location.lat || !location.lng) {
      return res.status(400).json({ error: 'location must include lat and lng' });
    }

    for (const targetId of targets) {
      const conn = await Connection.findOne({
        $or: [
          { requester: req.user.id, recipient: targetId },
          { requester: targetId, recipient: req.user.id },
        ],
        status: 'accepted',
      });
      if (!conn) {
        return res.status(403).json({ error: `No accepted connection with user ${targetId}` });
      }
    }

    const alarm = await BuzzerAlarm.create({
      owner: req.user.id,
      targets,
      location: {
        lat: location.lat,
        lng: location.lng,
        radiusMeters: location.radiusMeters || 150,
      },
      label: label || '',
      tune: tune || 'default',
      sequenceGroup,
      sequenceOrder,
    });

    const io = req.app.get('io');
    if (io) {
      for (const targetId of targets) {
        io.to(`user:${targetId}`).emit('alarm:created', {
          alarmId: alarm._id,
          owner: { id: req.user.id },
          location: alarm.location,
          label: alarm.label,
        });
      }
    }

    res.status(201).json(alarm);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/mine', async (req, res) => {
  try {
    const alarms = await BuzzerAlarm.find({ owner: req.user.id })
      .populate('targets', 'name username')
      .sort({ createdAt: -1 });
    res.json(alarms);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/targeting-me', async (req, res) => {
  try {
    const alarms = await BuzzerAlarm.find({ targets: req.user.id, status: 'active' })
      .populate('owner', 'name username')
      .sort({ createdAt: -1 });
    res.json(alarms);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const alarm = await BuzzerAlarm.findById(req.params.id);
    if (!alarm) return res.status(404).json({ error: 'Alarm not found' });
    if (alarm.owner.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Only the owner can cancel' });
    }
    if (alarm.status !== 'active') {
      return res.status(400).json({ error: `Cannot cancel a ${alarm.status} alarm` });
    }

    alarm.status = 'cancelled';
    await alarm.save();

    const io = req.app.get('io');
    if (io) {
      for (const targetId of alarm.targets) {
        io.to(`user:${targetId}`).emit('alarm:cancelled', { alarmId: alarm._id });
      }
    }

    res.json(alarm);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/trigger', validate(['location']), async (req, res) => {
  try {
    const alarm = await BuzzerAlarm.findById(req.params.id);
    if (!alarm) return res.status(404).json({ error: 'Alarm not found' });
    const isOwner = alarm.owner.toString() === req.user.id;
    const isTarget = alarm.targets.map(t => t.toString()).includes(req.user.id);
    if (!isOwner && !isTarget) {
      return res.status(403).json({ error: 'Only the owner or a target can trigger this alarm' });
    }
    if (alarm.status !== 'active') {
      return res.status(400).json({ error: `Cannot trigger a ${alarm.status} alarm` });
    }

    alarm.status = 'triggered';
    await alarm.save();

    const triggerLog = await TriggerLog.create({
      alarmId: alarm._id,
      triggeredBy: req.user.id,
      location: req.body.location,
    });

    const io = req.app.get('io');
    if (io) {
      const triggerUser = await User.findById(req.user.id).select('name username');
      const payload = {
        alarmId: alarm._id,
        triggeredBy: { id: req.user.id, name: triggerUser?.name || '', username: triggerUser?.username || '' },
        location: req.body.location,
        label: alarm.label,
      };
      if (isOwner) {
        for (const targetId of alarm.targets) {
          io.to(`user:${targetId}`).emit('alarm:triggered', payload);
        }
      } else {
        io.to(`user:${alarm.owner}`).emit('alarm:triggered', payload);
        for (const targetId of alarm.targets) {
          if (targetId.toString() !== req.user.id) {
            io.to(`user:${targetId}`).emit('alarm:triggered', payload);
          }
        }
      }
    }

    // Sequence group: activate next alarm if this one was part of a sequence
    if (alarm.sequenceGroup) {
      const nextAlarm = await BuzzerAlarm.findOne({
        sequenceGroup: alarm.sequenceGroup,
        sequenceOrder: { $gt: alarm.sequenceOrder || 0 },
        status: 'active',
      }).sort({ sequenceOrder: 1 });
      // Next alarm in sequence is already active; client polls targeting-me
    }

    res.json({ alarm, triggerLog });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
