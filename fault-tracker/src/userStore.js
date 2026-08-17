const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = process.env.USER_DATA_FILE || path.join(__dirname, '..', 'data', 'users.json');

const VALID_ROLES = ['tenant', 'landlord'];

function readAll() {
  if (!fs.existsSync(DATA_FILE)) return [];
  const raw = fs.readFileSync(DATA_FILE, 'utf8').trim();
  return raw ? JSON.parse(raw) : [];
}

function writeAll(users) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  const actual = Buffer.from(hash, 'hex');
  return candidate.length === actual.length && crypto.timingSafeEqual(candidate, actual);
}

function findByEmail(email) {
  return readAll().find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null;
}

function findById(id) {
  return readAll().find((u) => u.id === Number(id)) || null;
}

function register({ email, password, name, role, unit }) {
  if (!email || !password || !name || !role) {
    throw new Error('email, password, name, and role are required');
  }
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`role must be one of: ${VALID_ROLES.join(', ')}`);
  }
  if (password.length < 8) {
    throw new Error('password must be at least 8 characters');
  }
  if (role === 'tenant' && !unit) {
    throw new Error('unit is required for tenant accounts');
  }
  if (findByEmail(email)) {
    throw new Error('an account with this email already exists');
  }

  const users = readAll();
  const user = {
    id: users.length ? Math.max(...users.map((u) => u.id)) + 1 : 1,
    email,
    passwordHash: hashPassword(password),
    name,
    role,
    unit: role === 'tenant' ? unit : null,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeAll(users);
  return toPublicUser(user);
}

function updatePassword(userId, newPassword) {
  if (!newPassword || newPassword.length < 8) {
    throw new Error('password must be at least 8 characters');
  }
  const users = readAll();
  const user = users.find((u) => u.id === Number(userId));
  if (!user) return false;
  user.passwordHash = hashPassword(newPassword);
  writeAll(users);
  return true;
}

function authenticate({ email, password }) {
  const user = findByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return null;
  }
  return toPublicUser(user);
}

function toPublicUser(user) {
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

module.exports = { register, authenticate, findById, findByEmail, updatePassword, VALID_ROLES };
