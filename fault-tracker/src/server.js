const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const faultStore = require('./faultStore');
const userStore = require('./userStore');
const sessionStore = require('./sessionStore');

const SESSION_COOKIE = 'session_token';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

function attachUser(req, res, next) {
  const token = req.cookies[SESSION_COOKIE];
  const userId = token ? sessionStore.getUserId(token) : null;
  req.user = userId ? userStore.findById(userId) : null;
  next();
}
app.use(attachUser);

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'not logged in' });
    if (req.user.role !== role) return res.status(403).json({ error: `must be a ${role}` });
    next();
  };
}

// --- Auth ---

app.post('/api/auth/register', (req, res) => {
  try {
    const user = userStore.register(req.body || {});
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = userStore.authenticate({ email, password });
  if (!user) return res.status(401).json({ error: 'invalid email or password' });

  const token = sessionStore.createSession(user.id);
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax' });
  res.json(user);
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies[SESSION_COOKIE];
  if (token) sessionStore.destroySession(token);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json(req.user || null);
});

// --- Faults ---

app.get('/api/faults', requireRole('landlord'), (req, res) => {
  res.json(faultStore.listFaults());
});

app.get('/api/faults/mine', requireRole('tenant'), (req, res) => {
  res.json(faultStore.listFaultsForTenant(req.user.id));
});

app.post('/api/faults', requireRole('tenant'), (req, res) => {
  try {
    const fault = faultStore.createFault({
      tenantId: req.user.id,
      tenantName: req.user.name,
      unit: req.user.unit,
      title: (req.body || {}).title,
      description: (req.body || {}).description,
    });
    res.status(201).json(fault);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/faults/:id/status', requireRole('landlord'), (req, res) => {
  try {
    const fault = faultStore.updateStatus(req.params.id, req.body.status);
    if (!fault) return res.status(404).json({ error: 'fault not found' });
    res.json(fault);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/faults/unread-count', requireRole('landlord'), (req, res) => {
  res.json({ count: faultStore.getUnreadCount() });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`fault-tracker listening on port ${PORT}`));
}

module.exports = app;
