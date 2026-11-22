const dns = require('dns');
const { Resolver } = require('dns').promises;
const mongoose = require('mongoose');
const env = require('./env');

dns.setDefaultResultOrder('ipv4first');

async function srvToStandard(uri) {
  if (!uri.startsWith('mongodb+srv://')) return uri;

  const parsed = new URL(uri);
  const host = parsed.hostname;
  const user = decodeURIComponent(parsed.username);
  const pass = decodeURIComponent(parsed.password);
  const dbName = parsed.pathname.replace('/', '') || 'geobuzzer';
  const queryFromUri = parsed.search ? parsed.search.slice(1) : '';

  const resolver = new Resolver();
  resolver.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

  const srvRecords = await resolver.resolveSrv(`_mongodb._tcp.${host}`);
  const hosts = srvRecords.map(r => `${r.name}:${r.port}`).join(',');

  let txtOptions = '';
  try {
    const txtRecords = await resolver.resolveTxt(host);
    txtOptions = txtRecords.flat().join('');
  } catch (_) {}

  let qs = `ssl=true`;
  if (txtOptions) qs += `&${txtOptions}`;
  if (!qs.includes('authSource')) qs += `&authSource=admin`;
  if (queryFromUri) {
    const extra = queryFromUri.split('&').filter(p => !qs.includes(p.split('=')[0]));
    if (extra.length) qs += `&${extra.join('&')}`;
  }

  const standardUri = `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${hosts}/${dbName}?${qs}`;
  console.log(`Resolved SRV to ${srvRecords.length} hosts`);
  return standardUri;
}

async function connectDB(retries = 3) {
  let uri = env.mongoUri;

  if (uri.startsWith('mongodb+srv://')) {
    try {
      uri = await srvToStandard(uri);
    } catch (err) {
      console.error('SRV resolution failed:', err.message);
      throw err;
    }
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(uri, {
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
