const express = require('express');
const Connection = require('../models/Connection');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();
router.use(authMiddleware);

router.post('/request', validate(['recipientUsername']), async (req, res) => {
  try {
    const { recipientUsername } = req.body;
    const recipient = await User.findOne({ username: recipientUsername.toLowerCase() });
    if (!recipient) return res.status(404).json({ error: 'User not found' });
    if (recipient._id.toString() === req.user.id) {
      return res.status(400).json({ error: 'Cannot connect with yourself' });
    }

    const existing = await Connection.findOne({
      $or: [
        { requester: req.user.id, recipient: recipient._id },
        { requester: recipient._id, recipient: req.user.id },
      ],
    });

    if (existing) {
      if (existing.status === 'accepted') return res.status(409).json({ error: 'Already connected' });
      if (existing.status === 'pending') return res.status(409).json({ error: 'Request already pending' });
      if (existing.status === 'rejected' || existing.status === 'revoked') {
        existing.requester = req.user.id;
        existing.recipient = recipient._id;
        existing.status = 'pending';
        existing.createdAt = new Date();
        existing.respondedAt = undefined;
        await existing.save();
        return res.status(201).json(existing);
      }
    }

    const connection = await Connection.create({
      requester: req.user.id,
      recipient: recipient._id,
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${recipient._id}`).emit('connection:requested', {
        connectionId: connection._id,
        requester: { id: req.user.id },
      });
    }

    res.status(201).json(connection);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Connection already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/accept', async (req, res) => {
  try {
    const connection = await Connection.findById(req.params.id);
    if (!connection) return res.status(404).json({ error: 'Connection not found' });
    if (connection.recipient.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Only the recipient can accept' });
    }
    if (connection.status !== 'pending') {
      return res.status(400).json({ error: `Cannot accept a ${connection.status} connection` });
    }

    connection.status = 'accepted';
    connection.respondedAt = new Date();
    await connection.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${connection.requester}`).emit('connection:accepted', {
        connectionId: connection._id,
        recipient: { id: req.user.id },
      });
    }

    res.json(connection);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const connection = await Connection.findById(req.params.id);
    if (!connection) return res.status(404).json({ error: 'Connection not found' });
    if (connection.recipient.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Only the recipient can reject' });
    }
    if (connection.status !== 'pending') {
      return res.status(400).json({ error: `Cannot reject a ${connection.status} connection` });
    }

    connection.status = 'rejected';
    connection.respondedAt = new Date();
    await connection.save();
    res.json(connection);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/revoke', async (req, res) => {
  try {
    const connection = await Connection.findById(req.params.id);
    if (!connection) return res.status(404).json({ error: 'Connection not found' });

    const isParty = [connection.requester.toString(), connection.recipient.toString()].includes(req.user.id);
    if (!isParty) return res.status(403).json({ error: 'Not part of this connection' });
    if (connection.status !== 'accepted') {
      return res.status(400).json({ error: `Cannot revoke a ${connection.status} connection` });
    }

    connection.status = 'revoked';
    connection.respondedAt = new Date();
    await connection.save();
    res.json(connection);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {
      $or: [{ requester: req.user.id }, { recipient: req.user.id }],
    };
    if (status) filter.status = status;

    const connections = await Connection.find(filter)
      .populate('requester', 'name username email')
      .populate('recipient', 'name username email')
      .sort({ createdAt: -1 });

    res.json(connections);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
