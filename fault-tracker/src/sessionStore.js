const crypto = require('crypto');

// In-memory only: sessions are cleared on server restart, which is fine for
// this demo app (no persisted session storage is needed).
const sessionsByToken = new Map();

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessionsByToken.set(token, userId);
  return token;
}

function getUserId(token) {
  return sessionsByToken.get(token) || null;
}

function destroySession(token) {
  sessionsByToken.delete(token);
}

module.exports = { createSession, getUserId, destroySession };
