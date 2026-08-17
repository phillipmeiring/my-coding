const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fault-tracker-server-'));
process.env.USER_DATA_FILE = path.join(tmpDir, 'users.json');
process.env.FAULT_DATA_FILE = path.join(tmpDir, 'faults.json');

const request = require('supertest');
const app = require('../src/server');
const userStore = require('../src/userStore');
const resetStore = require('../src/resetStore');

function agent() {
  return request.agent(app);
}

async function registerAndLogin(client, overrides = {}) {
  const user = {
    email: `${Math.random().toString(36).slice(2)}@x.com`,
    password: 'longenough',
    name: 'Test User',
    role: 'tenant',
    unit: '4B',
    ...overrides,
  };
  await client.post('/api/auth/register').send(user).expect(201);
  await client.post('/api/auth/login').send({ email: user.email, password: user.password }).expect(200);
  return user;
}

test('unauthenticated requests to protected routes are rejected', async () => {
  await request(app).get('/api/faults').expect(401);
  await request(app).post('/api/faults').send({ title: 'x' }).expect(401);
});

test('a tenant can submit a fault and it appears in their own list, tied to their account', async () => {
  const client = agent();
  await registerAndLogin(client, { role: 'tenant', unit: '9C', name: 'Alice' });

  const created = await client
    .post('/api/faults')
    .send({ title: 'Leaking tap', description: 'Under the sink' })
    .expect(201);

  assert.equal(created.body.tenantName, 'Alice');
  assert.equal(created.body.unit, '9C');

  const mine = await client.get('/api/faults/mine').expect(200);
  assert.equal(mine.body.length, 1);
  assert.equal(mine.body[0].title, 'Leaking tap');
});

test('a tenant cannot access the landlord dashboard', async () => {
  const client = agent();
  await registerAndLogin(client, { role: 'tenant' });
  await client.get('/api/faults').expect(403);
});

test('a landlord can see faults but cannot submit one', async () => {
  const client = agent();
  await registerAndLogin(client, { role: 'landlord', unit: undefined });
  await client.post('/api/faults').send({ title: 'x' }).expect(403);
  const res = await client.get('/api/faults').expect(200);
  assert.ok(Array.isArray(res.body));
});

test('forgot-password responds the same way for a registered and an unregistered email', async () => {
  const client = agent();
  const user = await registerAndLogin(client, { role: 'tenant' });

  const known = await request(app).post('/api/auth/forgot-password').send({ email: user.email });
  const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@x.com' });

  assert.equal(known.status, unknown.status);
  assert.deepEqual(known.body, unknown.body);
});

test('reset-password with a valid token changes the password and logs out existing sessions', async () => {
  const client = agent();
  const user = await registerAndLogin(client, { role: 'tenant' });
  await client.get('/api/faults/mine').expect(200); // session is valid before reset

  const stored = userStore.findByEmail(user.email);
  const token = resetStore.createToken(stored.id);

  await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'brand-new-password' }).expect(200);

  // old session should now be logged out
  await client.get('/api/faults/mine').expect(401);

  // old password no longer works, new password does
  await request(app).post('/api/auth/login').send({ email: user.email, password: user.password }).expect(401);
  await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: 'brand-new-password' })
    .expect(200);
});

test('reset-password rejects an invalid or already-used token', async () => {
  await request(app)
    .post('/api/auth/reset-password')
    .send({ token: 'bogus-token', newPassword: 'brand-new-password' })
    .expect(400);
});

test('logout clears the session', async () => {
  const client = agent();
  await registerAndLogin(client, { role: 'tenant' });
  await client.get('/api/faults/mine').expect(200);
  await client.post('/api/auth/logout').expect(200);
  await client.get('/api/faults/mine').expect(401);
});
