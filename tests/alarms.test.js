const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcryptjs');

let mongoServer, app;

async function createVerifiedUser(name, username, email) {
  const User = require('../src/models/User');
  return User.create({
    name, username, email,
    passwordHash: await bcrypt.hash('password123', 10),
    isEmailVerified: true,
  });
}

async function loginUser(app, email) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'password123' });
  return res.body.accessToken;
}

async function connectUsers(app, token, recipientUsername) {
  return request(app)
    .post('/api/connections/request')
    .set('Authorization', `Bearer ${token}`)
    .send({ recipientUsername });
}

beforeAll(async () => {
  await mongoose.disconnect();
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

  for (const key of Object.keys(require.cache)) {
    if (key.includes('src')) delete require.cache[key];
  }

  const mod = require('../src/index');
  app = mod.app;
  await mongoose.connect(mongoServer.getUri());
}, 30000);

afterAll(async () => {
  await mongoose.connection.close();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany();
  }
});

describe('Alarms', () => {
  it('creates an alarm with accepted connection', async () => {
    const alice = await createVerifiedUser('Alice', 'alice', 'alice@test.com');
    const bob = await createVerifiedUser('Bob', 'bob', 'bob@test.com');
    const aliceToken = await loginUser(app, 'alice@test.com');
    const bobToken = await loginUser(app, 'bob@test.com');

    const connRes = await connectUsers(app, aliceToken, 'bob');
    await request(app)
      .post(`/api/connections/${connRes.body._id}/accept`)
      .set('Authorization', `Bearer ${bobToken}`);

    const res = await request(app)
      .post('/api/alarms')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        targets: [bob._id],
        location: { lat: 28.6139, lng: 77.2090 },
        label: 'Test Alarm',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
  });

  it('rejects alarm without accepted connection', async () => {
    const alice = await createVerifiedUser('Alice', 'alice', 'alice@test.com');
    const bob = await createVerifiedUser('Bob', 'bob', 'bob@test.com');
    const aliceToken = await loginUser(app, 'alice@test.com');

    const res = await request(app)
      .post('/api/alarms')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        targets: [bob._id],
        location: { lat: 28.6139, lng: 77.2090 },
      });

    expect(res.status).toBe(403);
  });

  it('lists alarms targeting me', async () => {
    const alice = await createVerifiedUser('Alice', 'alice', 'alice@test.com');
    const bob = await createVerifiedUser('Bob', 'bob', 'bob@test.com');
    const aliceToken = await loginUser(app, 'alice@test.com');
    const bobToken = await loginUser(app, 'bob@test.com');

    const connRes = await connectUsers(app, aliceToken, 'bob');
    await request(app)
      .post(`/api/connections/${connRes.body._id}/accept`)
      .set('Authorization', `Bearer ${bobToken}`);

    await request(app)
      .post('/api/alarms')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ targets: [bob._id], location: { lat: 28.6, lng: 77.2 }, label: 'Go here' });

    const res = await request(app)
      .get('/api/alarms/targeting-me')
      .set('Authorization', `Bearer ${bobToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].label).toBe('Go here');
  });

  it('owner can cancel an alarm', async () => {
    const alice = await createVerifiedUser('Alice', 'alice', 'alice@test.com');
    const bob = await createVerifiedUser('Bob', 'bob', 'bob@test.com');
    const aliceToken = await loginUser(app, 'alice@test.com');
    const bobToken = await loginUser(app, 'bob@test.com');

    const connRes = await connectUsers(app, aliceToken, 'bob');
    await request(app)
      .post(`/api/connections/${connRes.body._id}/accept`)
      .set('Authorization', `Bearer ${bobToken}`);

    const alarmRes = await request(app)
      .post('/api/alarms')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ targets: [bob._id], location: { lat: 28.6, lng: 77.2 } });

    const res = await request(app)
      .post(`/api/alarms/${alarmRes.body._id}/cancel`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });

  it('target can trigger an alarm', async () => {
    const alice = await createVerifiedUser('Alice', 'alice', 'alice@test.com');
    const bob = await createVerifiedUser('Bob', 'bob', 'bob@test.com');
    const aliceToken = await loginUser(app, 'alice@test.com');
    const bobToken = await loginUser(app, 'bob@test.com');

    const connRes = await connectUsers(app, aliceToken, 'bob');
    await request(app)
      .post(`/api/connections/${connRes.body._id}/accept`)
      .set('Authorization', `Bearer ${bobToken}`);

    const alarmRes = await request(app)
      .post('/api/alarms')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ targets: [bob._id], location: { lat: 28.6, lng: 77.2 } });

    const res = await request(app)
      .post(`/api/alarms/${alarmRes.body._id}/trigger`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ location: { lat: 28.6001, lng: 77.2001 } });

    expect(res.status).toBe(200);
    expect(res.body.alarm.status).toBe('triggered');
    expect(res.body.triggerLog).toBeDefined();
  });

  it('non-target cannot trigger an alarm', async () => {
    const alice = await createVerifiedUser('Alice', 'alice', 'alice@test.com');
    const bob = await createVerifiedUser('Bob', 'bob', 'bob@test.com');
    const aliceToken = await loginUser(app, 'alice@test.com');
    const bobToken = await loginUser(app, 'bob@test.com');

    const connRes = await connectUsers(app, aliceToken, 'bob');
    await request(app)
      .post(`/api/connections/${connRes.body._id}/accept`)
      .set('Authorization', `Bearer ${bobToken}`);

    const alarmRes = await request(app)
      .post('/api/alarms')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ targets: [bob._id], location: { lat: 28.6, lng: 77.2 } });

    const res = await request(app)
      .post(`/api/alarms/${alarmRes.body._id}/trigger`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ location: { lat: 28.6, lng: 77.2 } });

    expect(res.status).toBe(403);
  });
});
