const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function freshStore() {
  const tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fault-tracker-')), 'users.json');
  process.env.USER_DATA_FILE = tmpFile;
  delete require.cache[require.resolve('../src/userStore')];
  return require('../src/userStore');
}

test('register requires email, password, name, and role', () => {
  const store = freshStore();
  assert.throws(() => store.register({ password: 'longenough', name: 'Alice', role: 'tenant', unit: '4B' }), /email/);
});

test('register requires a unit for tenants but not landlords', () => {
  const store = freshStore();
  assert.throws(
    () => store.register({ email: 'a@x.com', password: 'longenough', name: 'Alice', role: 'tenant' }),
    /unit is required/
  );
  assert.doesNotThrow(() =>
    store.register({ email: 'l@x.com', password: 'longenough', name: 'Lou', role: 'landlord' })
  );
});

test('register rejects short passwords', () => {
  const store = freshStore();
  assert.throws(
    () => store.register({ email: 'a@x.com', password: 'short', name: 'Alice', role: 'tenant', unit: '4B' }),
    /at least 8 characters/
  );
});

test('register rejects duplicate emails (case-insensitive)', () => {
  const store = freshStore();
  store.register({ email: 'a@x.com', password: 'longenough', name: 'Alice', role: 'tenant', unit: '4B' });
  assert.throws(
    () => store.register({ email: 'A@X.com', password: 'longenough', name: 'Alice 2', role: 'tenant', unit: '5C' }),
    /already exists/
  );
});

test('register never returns the password hash', () => {
  const store = freshStore();
  const user = store.register({ email: 'a@x.com', password: 'longenough', name: 'Alice', role: 'tenant', unit: '4B' });
  assert.equal(user.passwordHash, undefined);
});

test('updatePassword changes which password authenticates', () => {
  const store = freshStore();
  const user = store.register({ email: 'a@x.com', password: 'old-password', name: 'Alice', role: 'tenant', unit: '4B' });

  assert.equal(store.updatePassword(user.id, 'new-password'), true);
  assert.equal(store.authenticate({ email: 'a@x.com', password: 'old-password' }), null);
  assert.ok(store.authenticate({ email: 'a@x.com', password: 'new-password' }));
});

test('updatePassword rejects short passwords and returns false for an unknown user', () => {
  const store = freshStore();
  const user = store.register({ email: 'a@x.com', password: 'old-password', name: 'Alice', role: 'tenant', unit: '4B' });
  assert.throws(() => store.updatePassword(user.id, 'short'), /at least 8 characters/);
  assert.equal(store.updatePassword(999, 'long-enough-password'), false);
});

test('authenticate succeeds with correct credentials and fails otherwise', () => {
  const store = freshStore();
  store.register({ email: 'a@x.com', password: 'correct-password', name: 'Alice', role: 'tenant', unit: '4B' });

  const ok = store.authenticate({ email: 'a@x.com', password: 'correct-password' });
  assert.equal(ok.email, 'a@x.com');

  assert.equal(store.authenticate({ email: 'a@x.com', password: 'wrong-password' }), null);
  assert.equal(store.authenticate({ email: 'nobody@x.com', password: 'correct-password' }), null);
});
