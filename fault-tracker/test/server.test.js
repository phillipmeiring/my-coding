const test = require('node:test');
const { mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fault-tracker-server-'));
process.env.USER_DATA_FILE = path.join(tmpDir, 'users.json');
process.env.FAULT_DATA_FILE = path.join(tmpDir, 'faults.json');
process.env.UPLOADS_DIR = path.join(tmpDir, 'uploads');

const mailer = require('../src/mailer');
// Every other test in this file just needs fault creation to not actually
// talk to the network; the real send path is covered by mailer.test.js.
const sendFaultNotification = mock.method(mailer, 'sendFaultNotification', async () => ({ mocked: true }));

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

test('a tenant can attach photos, and only the owner or a landlord can view them', async () => {
  const tenantClient = agent();
  await registerAndLogin(tenantClient, { role: 'tenant', unit: '5D', name: 'Bob' });

  const landlordClient = agent();
  await registerAndLogin(landlordClient, { role: 'landlord', unit: undefined, email: 'landlord2@x.com' });

  const otherTenantClient = agent();
  await registerAndLogin(otherTenantClient, { role: 'tenant' });

  const created = await tenantClient
    .post('/api/faults')
    .field('title', 'Broken window')
    .field('description', 'Cracked glass')
    .attach('photos', Buffer.from('fake image bytes'), { filename: 'crack.png', contentType: 'image/png' })
    .expect(201);

  assert.equal(created.body.photos.length, 1);
  const filename = created.body.photos[0];

  await tenantClient.get(`/api/faults/${created.body.id}/photos/${filename}`).expect(200);
  await landlordClient.get(`/api/faults/${created.body.id}/photos/${filename}`).expect(200);
  await otherTenantClient.get(`/api/faults/${created.body.id}/photos/${filename}`).expect(403);
  await tenantClient.get(`/api/faults/${created.body.id}/photos/not-a-real-file.png`).expect(404);
});

test('rejects a non-image file upload', async () => {
  const client = agent();
  await registerAndLogin(client, { role: 'tenant' });
  await client
    .post('/api/faults')
    .field('title', 'x')
    .attach('photos', Buffer.from('not an image'), { filename: 'notes.txt', contentType: 'text/plain' })
    .expect(400);
});

test('rejects more than the max number of photos', async () => {
  const client = agent();
  await registerAndLogin(client, { role: 'tenant' });
  let req = client.post('/api/faults').field('title', 'x');
  for (let i = 0; i < 4; i++) {
    req = req.attach('photos', Buffer.from('fake'), { filename: `p${i}.png`, contentType: 'image/png' });
  }
  await req.expect(400);
});

test('creating a fault notifies all registered landlords by email', async () => {
  const landlordClient = agent();
  await registerAndLogin(landlordClient, { role: 'landlord', unit: undefined, email: 'landlord1@x.com' });

  const tenantClient = agent();
  await registerAndLogin(tenantClient, { role: 'tenant', unit: '9C', name: 'Alice' });

  const callsBefore = sendFaultNotification.mock.calls.length;
  const created = await tenantClient
    .post('/api/faults')
    .send({ title: 'Leak', description: 'desc' })
    .expect(201);

  assert.equal(sendFaultNotification.mock.calls.length, callsBefore + 1);
  const [emails, fault] = sendFaultNotification.mock.calls.at(-1).arguments;
  assert.ok(emails.includes('landlord1@x.com'));
  assert.equal(fault.id, created.body.id);
});

test('fault creation still succeeds even if sending the notification email fails', async () => {
  sendFaultNotification.mock.mockImplementationOnce(async () => {
    throw new Error('SMTP is down');
  });

  const client = agent();
  await registerAndLogin(client, { role: 'tenant' });
  await client.post('/api/faults').send({ title: 'Leak', description: 'desc' }).expect(201);
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
