require('dotenv').config();
const request = require('supertest');
const db = require('../src/config/database');
const app = require('../src/app');
const { v4: uuidv4 } = require('uuid');

describe('INTEGRATION TESTS: User API', () => {
  let adminToken;

  // Mock Admin User
  const adminUser = {
    email: 'admin@test.com',
    password: 'adminpassword',
    role: 'admin',
  };

  beforeAll(async () => {
    // 1. Clear and create Admin
    await db.query('DELETE FROM users');

    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(adminUser.password, 10);
    const adminId = uuidv4();

    // Insert Admin (no password change required to facilitate testing))
    await db.query(
      'INSERT INTO users (id, name, email, password, role, is_active, must_change_password) VALUES (?, ?, ?, ?, ?, true, false)',
      [adminId, 'Admin Test', adminUser.email, hash, adminUser.role],
    );

    // 2. Login to get the Token
    const res = await request(app).post('/api/auth/login').send(adminUser);
    adminToken = res.body.token;
  });

  afterAll(async () => {
    await db.query('DELETE FROM users');
    // await db.end(); // Let Jest handle the closing.
  });

  it('Should ACTUALLY insert a user into the database (Auto-generated password)', async () => {
    const newUser = {
      name: 'Integration User',
      email: `integration.${Date.now()}@test.com`,
      role: 'attendant',
      // Note: We do not send passwords; the system should generate them!
    };

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newUser);

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.email).toEqual(newUser.email);
    // Check if the message mentions sending it by email.
    expect(res.body.message).toMatch(/e-?mail/i);

    // Check the database
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [newUser.email]);
    expect(rows).toHaveLength(1);
    expect(rows[0].must_change_password).toBeTruthy(); // Must be 1 (true)
  });
});
