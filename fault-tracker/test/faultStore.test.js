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

test('createFault requires tenantId, tenantName, unit, and title', () => {
  const store = freshStore();
  assert.throws(() => store.createFault({ tenantName: 'Alice', unit: '4B', title: 'Leak' }), /tenantId/);
});

test('createFault stores a new fault with status "new"', () => {
  const store = freshStore();
  const fault = store.createFault({ tenantId: 1, tenantName: 'Alice', unit: '4B', title: 'Leaking tap' });
  assert.equal(fault.status, 'new');
  assert.equal(fault.tenantId, 1);
  assert.equal(fault.tenantName, 'Alice');
  assert.equal(store.listFaults().length, 1);
});

test('createFault defaults photos to an empty array and stores them when provided', () => {
  const store = freshStore();
  const withoutPhotos = store.createFault({ tenantId: 1, tenantName: 'Alice', unit: '4B', title: 'Leak' });
  assert.deepEqual(withoutPhotos.photos, []);

  const withPhotos = store.createFault({
    tenantId: 1,
    tenantName: 'Alice',
    unit: '4B',
    title: 'Leak',
    photos: ['a.jpg', 'b.png'],
  });
  assert.deepEqual(withPhotos.photos, ['a.jpg', 'b.png']);
});

test('findById returns the matching fault or null', () => {
  const store = freshStore();
  const fault = store.createFault({ tenantId: 1, tenantName: 'Alice', unit: '4B', title: 'Leak' });
  assert.equal(store.findById(fault.id).title, 'Leak');
  assert.equal(store.findById(999), null);
});

test('listFaults returns newest first', () => {
  const store = freshStore();
  store.createFault({ tenantId: 1, tenantName: 'Alice', unit: '4B', title: 'First' });
  store.createFault({ tenantId: 2, tenantName: 'Bob', unit: '2A', title: 'Second' });
  const [latest] = store.listFaults();
  assert.equal(latest.title, 'Second');
});

test('listFaultsForTenant only returns that tenant\'s faults', () => {
  const store = freshStore();
  store.createFault({ tenantId: 1, tenantName: 'Alice', unit: '4B', title: 'Alice fault' });
  store.createFault({ tenantId: 2, tenantName: 'Bob', unit: '2A', title: 'Bob fault' });
  const aliceFaults = store.listFaultsForTenant(1);
  assert.equal(aliceFaults.length, 1);
  assert.equal(aliceFaults[0].title, 'Alice fault');
});

test('updateStatus transitions a fault and rejects invalid statuses', () => {
  const store = freshStore();
  const fault = store.createFault({ tenantId: 1, tenantName: 'Alice', unit: '4B', title: 'Leak' });
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
  const a = store.createFault({ tenantId: 1, tenantName: 'Alice', unit: '4B', title: 'A' });
  store.createFault({ tenantId: 2, tenantName: 'Bob', unit: '2A', title: 'B' });
  assert.equal(store.getUnreadCount(), 2);
  store.updateStatus(a.id, 'acknowledged');
  assert.equal(store.getUnreadCount(), 1);
});
