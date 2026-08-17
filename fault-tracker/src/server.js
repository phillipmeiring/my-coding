const express = require('express');
const path = require('path');
const faultStore = require('./faultStore');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/faults', (req, res) => {
  res.json(faultStore.listFaults());
});

app.post('/api/faults', (req, res) => {
  try {
    const fault = faultStore.createFault(req.body || {});
    res.status(201).json(fault);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/faults/:id/status', (req, res) => {
  try {
    const fault = faultStore.updateStatus(req.params.id, req.body.status);
    if (!fault) return res.status(404).json({ error: 'fault not found' });
    res.json(fault);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/faults/unread-count', (req, res) => {
  res.json({ count: faultStore.getUnreadCount() });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`fault-tracker listening on port ${PORT}`));
}

module.exports = app;
