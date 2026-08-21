const express = require('express');
const cors = require('cors');
const http = require('http');
const connectDB = require('./config/db');
const env = require('./config/env');
const authRoutes = require('./routes/auth');
const connectionRoutes = require('./routes/connections');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/connections', connectionRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

async function start() {
  await connectDB();
  server.listen(env.port, () => {
    console.log(`GeoBuzzer API running on port ${env.port}`);
  });
}

if (require.main === module) {
  start();
} else {
  // When imported as a module (e.g. by the test suite), connect to the
  // database but don't bind a port — the caller (supertest) drives the
  // app directly and manages its own lifecycle.
  connectDB().catch((err) => {
    console.error('MongoDB connection error:', err);
  });
}

module.exports = { app, server, start };
