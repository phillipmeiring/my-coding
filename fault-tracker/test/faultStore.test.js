const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function freshStore() {
  const tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fault-tracker-')), 'faults.json');
  process.env.FAULT_DATA_FILE = tmpFile;
  delete require.cache[require.resolve('../src/faultStore')];
  return require('../src/faultStore');
}

test('createFault requires tenantName, unit, and title', () => {
  const store = freshStore();
  assert.throws(() => store.createFault({ unit: '4B', title: 'Leak' }), /tenantName/);
});

test('createFault stores a new fault with status "new"', () => {
  const store = freshStore();
  const fault = store.createFault({ tenantName: 'Alice', unit: '4B', title: 'Leaking tap' });
  assert.equal(fault.status, 'new');
  assert.equal(fault.tenantName, 'Alice');
  assert.equal(store.listFaults().length, 1);
});

test('listFaults returns newest first', () => {
  const store = freshStore();
  store.createFault({ tenantName: 'Alice', unit: '4B', title: 'First' });
  store.createFault({ tenantName: 'Bob', unit: '2A', title: 'Second' });
  const [latest] = store.listFaults();
  assert.equal(latest.title, 'Second');
});

test('updateStatus transitions a fault and rejects invalid statuses', () => {
  const store = freshStore();
  const fault = store.createFault({ tenantName: 'Alice', unit: '4B', title: 'Leak' });
  const updated = store.updateStatus(fault.id, 'acknowledged');
  assert.equal(updated.status, 'acknowledged');
  assert.throws(() => store.updateStatus(fault.id, 'bogus'), /status must be one of/);
});

test('updateStatus returns null for an unknown id', () => {
  const store = freshStore();
  assert.equal(store.updateStatus(999, 'resolved'), null);
});

test('getUnreadCount only counts faults with status "new"', () => {
  const store = freshStore();
  const a = store.createFault({ tenantName: 'Alice', unit: '4B', title: 'A' });
  store.createFault({ tenantName: 'Bob', unit: '2A', title: 'B' });
  assert.equal(store.getUnreadCount(), 2);
  store.updateStatus(a.id, 'acknowledged');
  assert.equal(store.getUnreadCount(), 1);
});
