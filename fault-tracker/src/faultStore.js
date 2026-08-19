const fs = require('fs');
const path = require('path');

const DATA_FILE = process.env.FAULT_DATA_FILE || path.join(__dirname, '..', 'data', 'faults.json');

const VALID_STATUSES = ['new', 'acknowledged', 'resolved'];

function readAll() {
  if (!fs.existsSync(DATA_FILE)) return [];
  const raw = fs.readFileSync(DATA_FILE, 'utf8').trim();
  return raw ? JSON.parse(raw) : [];
}

function writeAll(faults) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(faults, null, 2));
}

function listFaults() {
  return readAll().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function listFaultsForTenant(tenantId) {
  return listFaults().filter((f) => f.tenantId === Number(tenantId));
}

function createFault({ tenantId, tenantName, unit, title, description, photos }) {
  if (!tenantId || !tenantName || !unit || !title) {
    throw new Error('tenantId, tenantName, unit, and title are required');
  }
  const faults = readAll();
  const fault = {
    id: faults.length ? Math.max(...faults.map((f) => f.id)) + 1 : 1,
    tenantId,
    tenantName,
    unit,
    title,
    description: description || '',
    photos: photos || [],
    status: 'new',
    createdAt: new Date().toISOString(),
  };
  faults.push(fault);
  writeAll(faults);
  return fault;
}

function findById(id) {
  return readAll().find((f) => f.id === Number(id)) || null;
}

function updateStatus(id, status) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  const faults = readAll();
  const fault = faults.find((f) => f.id === Number(id));
  if (!fault) return null;
  fault.status = status;
  writeAll(faults);
  return fault;
}

function getUnreadCount() {
  return readAll().filter((f) => f.status === 'new').length;
}

module.exports = {
  listFaults,
  listFaultsForTenant,
  createFault,
  findById,
  updateStatus,
  getUnreadCount,
  VALID_STATUSES,
};
