const dns = require('dns');
const mongoose = require('mongoose');
const env = require('./env');

dns.setServers(['8.8.8.8', '8.8.4.4']);

async function connectDB() {
  await mongoose.connect(env.mongoUri);
  console.log('MongoDB connected');
}

module.exports = connectDB;
