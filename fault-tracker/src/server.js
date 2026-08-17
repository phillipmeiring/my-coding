const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const faultStore = require('./faultStore');
const userStore = require('./userStore');
const sessionStore = require('./sessionStore');
const resetStore = require('./resetStore');
const mailer = require('./mailer');
const photoStorage = require('./photoStorage');

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

app.post('/api/auth/forgot-password', (req, res) => {
  const user = userStore.findByEmail((req.body || {}).email || '');
  if (user) {
    const token = resetStore.createToken(user.id);
    const resetLink = `${req.protocol}://${req.get('host')}/?resetToken=${token}`;
    // No email service is configured for this demo app, so the "email" is
    // simulated by logging the link the user would have received.
    console.log(`[password reset] ${user.email}: ${resetLink}`);
  }
  // Always respond the same way whether or not the email is registered, so
  // this endpoint can't be used to check which emails have accounts.
  res.json({ ok: true });
});

app.post('/api/auth/reset-password', (req, res) => {
  const { token, newPassword } = req.body || {};
  const userId = resetStore.consumeToken(token);
  if (!userId) return res.status(400).json({ error: 'invalid or expired reset link' });

  try {
    userStore.updatePassword(userId, newPassword);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  sessionStore.destroyAllForUser(userId);
  res.json({ ok: true });
});

// --- Faults ---

app.get('/api/faults', requireRole('landlord'), (req, res) => {
  res.json(faultStore.listFaults());
});

app.get('/api/faults/mine', requireRole('tenant'), (req, res) => {
  res.json(faultStore.listFaultsForTenant(req.user.id));
});

app.post(
  '/api/faults',
  requireRole('tenant'),
  photoStorage.upload.array('photos', photoStorage.MAX_FILES),
  async (req, res) => {
    let fault;
    try {
      const photos = photoStorage.savePhotos(req.files);
      fault = faultStore.createFault({
        tenantId: req.user.id,
        tenantName: req.user.name,
        unit: req.user.unit,
        title: (req.body || {}).title,
        description: (req.body || {}).description,
        photos,
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      await mailer.sendFaultNotification(userStore.listLandlordEmails(), fault);
    } catch (err) {
      // A notification failure shouldn't fail the tenant's fault report.
      console.error('[email] failed to send fault notification:', err.message);
    }

    res.status(201).json(fault);
  }
);

app.get('/api/faults/:id/photos/:filename', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'not logged in' });

  const fault = faultStore.findById(req.params.id);
  if (!fault) return res.status(404).json({ error: 'fault not found' });

  const isOwner = req.user.role === 'tenant' && req.user.id === fault.tenantId;
  const isLandlord = req.user.role === 'landlord';
  if (!isOwner && !isLandlord) return res.status(403).json({ error: 'not allowed to view this photo' });

  if (!fault.photos.includes(req.params.filename)) return res.status(404).json({ error: 'photo not found' });
  res.sendFile(photoStorage.photoPath(req.params.filename));
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

// Catches multer errors (bad file type, too many files, file too large),
// which arrive here via next(err) rather than reaching the route handler.
app.use((err, req, res, next) => {
  if (!err) return next();
  res.status(400).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`fault-tracker listening on port ${PORT}`));
}

module.exports = app;
