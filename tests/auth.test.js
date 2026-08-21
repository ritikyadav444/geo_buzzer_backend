const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

  const { app: expressApp } = require('../src/index');
  app = expressApp;
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

describe('POST /api/auth/signup', () => {
  it('creates a user and returns 201', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Test User', username: 'testuser', email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.message).toContain('Account created');
    expect(res.body.userId).toBeDefined();
  });

  it('rejects duplicate email', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ name: 'User1', username: 'user1', email: 'dup@example.com', password: 'pass123' });

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'User2', username: 'user2', email: 'dup@example.com', password: 'pass123' });

    expect(res.status).toBe(409);
  });

  it('rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Test' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/verify-otp', () => {
  it('verifies a valid OTP', async () => {
    const User = require('../src/models/User');
    const otp = '123456';
    const otpHash = await bcrypt.hash(otp, 10);

    await User.create({
      name: 'OTP User', username: 'otpuser', email: 'otp@example.com',
      passwordHash: await bcrypt.hash('pass', 10),
      otp: otpHash, otpExpiry: new Date(Date.now() + 600000),
    });

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: 'otp@example.com', otp: '123456' });

    expect(res.status).toBe(200);

    const user = await User.findOne({ email: 'otp@example.com' });
    expect(user.isEmailVerified).toBe(true);
  });
});

describe('POST /api/auth/login', () => {
  it('returns tokens for verified user', async () => {
    const User = require('../src/models/User');
    await User.create({
      name: 'Login User', username: 'loginuser', email: 'login@example.com',
      passwordHash: await bcrypt.hash('password123', 10),
      isEmailVerified: true,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.username).toBe('loginuser');
  });

  it('rejects unverified user', async () => {
    const User = require('../src/models/User');
    await User.create({
      name: 'Unverified', username: 'unverified', email: 'unverified@example.com',
      passwordHash: await bcrypt.hash('password123', 10),
      isEmailVerified: false,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unverified@example.com', password: 'password123' });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns new token pair', async () => {
    const User = require('../src/models/User');
    const user = await User.create({
      name: 'Refresh User', username: 'refreshuser', email: 'refresh@example.com',
      passwordHash: await bcrypt.hash('password123', 10),
      isEmailVerified: true,
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'refresh@example.com', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });
});
