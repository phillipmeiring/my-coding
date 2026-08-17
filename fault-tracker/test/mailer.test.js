const test = require('node:test');
const assert = require('node:assert/strict');

const mailer = require('../src/mailer');

test('sendFaultNotification does nothing when there are no landlord emails', async () => {
  const result = await mailer.sendFaultNotification([], { title: 'x', description: '', tenantName: 'A', unit: '1', createdAt: new Date().toISOString() });
  assert.equal(result, null);
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
