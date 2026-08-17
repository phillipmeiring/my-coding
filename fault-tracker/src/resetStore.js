const crypto = require('crypto');

const ONE_HOUR_MS = 60 * 60 * 1000;

// In-memory only, same tradeoff as sessionStore.js: fine for this demo app,
// tokens are lost on server restart.
const tokensByValue = new Map();

function createToken(userId, ttlMs = ONE_HOUR_MS) {
  const token = crypto.randomBytes(32).toString('hex');
  tokensByValue.set(token, { userId, expiresAt: Date.now() + ttlMs });
  return token;
}

// Single-use: a successful lookup removes the token so it can't be replayed.
function consumeToken(token) {
  const entry = tokensByValue.get(token);
  if (!entry) return null;
  tokensByValue.delete(token);
  if (entry.expiresAt < Date.now()) return null;
  return entry.userId;
}

module.exports = { createToken, consumeToken };
