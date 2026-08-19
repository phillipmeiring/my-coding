const test = require('node:test');
const assert = require('node:assert/strict');

// Force the Ethereal fallback path regardless of whatever the developer's
// own environment/.env has configured, so this test file is deterministic
// and never sends real email as a side effect of running the test suite.
delete process.env.SMTP_HOST;

const mailer = require('../src/mailer');

test('sendFaultNotification does nothing when there are no landlord emails', async () => {
  const result = await mailer.sendFaultNotification([], { title: 'x', description: '', tenantName: 'A', unit: '1', createdAt: new Date().toISOString() });
  assert.equal(result, null);
});

test('hasRealSmtpConfig is false with no SMTP_HOST and true once it is set', () => {
  const original = process.env.SMTP_HOST;
  try {
    delete process.env.SMTP_HOST;
    assert.equal(mailer.hasRealSmtpConfig(), false);

    process.env.SMTP_HOST = 'smtp.example.com';
    assert.equal(mailer.hasRealSmtpConfig(), true);
  } finally {
    if (original === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = original;
  }
});

test('realTransportConfig reads SMTP_* env vars, with sane defaults and no auth when unset', () => {
  const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS'];
  const originals = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    keys.forEach((k) => delete process.env[k]);

    process.env.SMTP_HOST = 'smtp.example.com';
    assert.deepEqual(mailer.realTransportConfig(), {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: undefined,
    });

    process.env.SMTP_PORT = '465';
    process.env.SMTP_SECURE = 'true';
    process.env.SMTP_USER = 'apikey';
    process.env.SMTP_PASS = 'secret';
    assert.deepEqual(mailer.realTransportConfig(), {
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'apikey', pass: 'secret' },
    });
  } finally {
    keys.forEach((k) => {
      if (originals[k] === undefined) delete process.env[k];
      else process.env[k] = originals[k];
    });
  }
});

// This test talks to Ethereal (nodemailer's fake-SMTP testing service) over
// the network. It's the one place we exercise the real send path end to end;
// server.test.js mocks this module out so the rest of the suite stays fast
// and network-independent.
test('sendFaultNotification sends a real (test) email via Ethereal', async () => {
  const fault = {
    title: 'Leaking tap',
    description: 'Dripping under the sink',
    tenantName: 'Alice',
    unit: '4B',
    createdAt: new Date().toISOString(),
  };

  const info = await mailer.sendFaultNotification(['landlord@example.com'], fault);
  assert.ok(info);
  assert.ok(info.messageId);
});
