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

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  delete require.cache[require.resolve('../src/index')];
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/config/db')];
  const mod = require('../src/index');
  app = mod.app;
  await mongoose.connection.asPromise();
});

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

describe('Connections', () => {
  it('sends a connection request', async () => {
    const alice = await createVerifiedUser('Alice', 'alice', 'alice@test.com');
    await createVerifiedUser('Bob', 'bob', 'bob@test.com');
    const token = await loginUser(app, 'alice@test.com');

    const res = await request(app)
      .post('/api/connections/request')
      .set('Authorization', `Bearer ${token}`)
      .send({ recipientUsername: 'bob' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
  });

  it('accepts a connection request', async () => {
    const alice = await createVerifiedUser('Alice', 'alice', 'alice@test.com');
    const bob = await createVerifiedUser('Bob', 'bob', 'bob@test.com');
    const aliceToken = await loginUser(app, 'alice@test.com');
    const bobToken = await loginUser(app, 'bob@test.com');

    const reqRes = await request(app)
      .post('/api/connections/request')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ recipientUsername: 'bob' });

    const res = await request(app)
      .post(`/api/connections/${reqRes.body._id}/accept`)
      .set('Authorization', `Bearer ${bobToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('accepted');
  });

  it('prevents non-recipient from accepting', async () => {
    const alice = await createVerifiedUser('Alice', 'alice', 'alice@test.com');
    await createVerifiedUser('Bob', 'bob', 'bob@test.com');
    const aliceToken = await loginUser(app, 'alice@test.com');

    const reqRes = await request(app)
      .post('/api/connections/request')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ recipientUsername: 'bob' });

    const res = await request(app)
      .post(`/api/connections/${reqRes.body._id}/accept`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(403);
  });

  it('lists connections filtered by status', async () => {
    const alice = await createVerifiedUser('Alice', 'alice', 'alice@test.com');
    await createVerifiedUser('Bob', 'bob', 'bob@test.com');
    const aliceToken = await loginUser(app, 'alice@test.com');

    await request(app)
      .post('/api/connections/request')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ recipientUsername: 'bob' });

    const res = await request(app)
      .get('/api/connections?status=pending')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('allows either side to revoke', async () => {
    const alice = await createVerifiedUser('Alice', 'alice', 'alice@test.com');
    await createVerifiedUser('Bob', 'bob', 'bob@test.com');
    const aliceToken = await loginUser(app, 'alice@test.com');
    const bobToken = await loginUser(app, 'bob@test.com');

    const reqRes = await request(app)
      .post('/api/connections/request')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ recipientUsername: 'bob' });

    await request(app)
      .post(`/api/connections/${reqRes.body._id}/accept`)
      .set('Authorization', `Bearer ${bobToken}`);

    const res = await request(app)
      .post(`/api/connections/${reqRes.body._id}/revoke`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('revoked');
  });
});
