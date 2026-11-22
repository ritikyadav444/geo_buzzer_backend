const dns = require('dns');
const mongoose = require('mongoose');
const env = require('./env');

dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

async function connectDB(retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(env.mongoUri, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        family: 4,
      });
      console.log('MongoDB connected');
      return;
    } catch (err) {
      console.error(`MongoDB connection attempt ${attempt}/${retries} failed:`, err.message);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 3000 * attempt));
    }
  }
}

module.exports = connectDB;
