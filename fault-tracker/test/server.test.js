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

test('logout clears the session', async () => {
  const client = agent();
  await registerAndLogin(client, { role: 'tenant' });
  await client.get('/api/faults/mine').expect(200);
  await client.post('/api/auth/logout').expect(200);
  await client.get('/api/faults/mine').expect(401);
});
