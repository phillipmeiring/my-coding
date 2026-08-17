const tabTenant = document.getElementById('tabTenant');
const tabLandlord = document.getElementById('tabLandlord');
const tenantView = document.getElementById('tenantView');
const landlordView = document.getElementById('landlordView');
const unreadBadge = document.getElementById('unreadBadge');
const faultForm = document.getElementById('faultForm');
const tenantMessage = document.getElementById('tenantMessage');
const faultsBody = document.getElementById('faultsBody');
const landlordEmpty = document.getElementById('landlordEmpty');

function showTenant() {
  tabTenant.classList.add('active');
  tabLandlord.classList.remove('active');
  tenantView.hidden = false;
  landlordView.hidden = true;
}

function showLandlord() {
  tabLandlord.classList.add('active');
  tabTenant.classList.remove('active');
  landlordView.hidden = false;
  tenantView.hidden = true;
  loadFaults();
}

tabTenant.addEventListener('click', showTenant);
tabLandlord.addEventListener('click', showLandlord);

faultForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(faultForm);
  const body = Object.fromEntries(formData.entries());

  const res = await fetch('/api/faults', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    faultForm.reset();
    tenantMessage.textContent = 'Fault reported. The landlord has been alerted.';
    refreshUnreadCount();
  } else {
    const { error } = await res.json();
    tenantMessage.textContent = `Error: ${error}`;
  }
});

async function loadFaults() {
  const res = await fetch('/api/faults');
  const faults = await res.json();

  faultsBody.innerHTML = '';
  landlordEmpty.hidden = faults.length > 0;

  for (const fault of faults) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(fault.unit)}</td>
      <td>${escapeHtml(fault.tenantName)}</td>
      <td>${escapeHtml(fault.title)}</td>
      <td>${escapeHtml(fault.description)}</td>
      <td class="status-${fault.status}">${fault.status}</td>
      <td>${new Date(fault.createdAt).toLocaleString()}</td>
      <td></td>
    `;

    const actionsCell = row.lastElementChild;
    if (fault.status !== 'resolved') {
      const nextStatus = fault.status === 'new' ? 'acknowledged' : 'resolved';
      const btn = document.createElement('button');
      btn.textContent = nextStatus === 'acknowledged' ? 'Acknowledge' : 'Resolve';
      btn.addEventListener('click', async () => {
        await fetch(`/api/faults/${fault.id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        });
        loadFaults();
        refreshUnreadCount();
      });
      actionsCell.appendChild(btn);
    }

    faultsBody.appendChild(row);
  }
}

async function refreshUnreadCount() {
  const res = await fetch('/api/faults/unread-count');
  const { count } = await res.json();
  unreadBadge.hidden = count === 0;
  unreadBadge.textContent = count;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

refreshUnreadCount();
setInterval(refreshUnreadCount, 5000);
