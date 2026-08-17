const userNav = document.getElementById('userNav');
const userLabel = document.getElementById('userLabel');
const unreadBadge = document.getElementById('unreadBadge');
const logoutBtn = document.getElementById('logoutBtn');

const authView = document.getElementById('authView');
const tenantView = document.getElementById('tenantView');
const landlordView = document.getElementById('landlordView');

const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const registerRole = document.getElementById('registerRole');
const unitField = document.getElementById('unitField');
const authMessage = document.getElementById('authMessage');

const forgotPasswordLink = document.getElementById('forgotPasswordLink');
const backToLoginLink = document.getElementById('backToLoginLink');
const forgotPasswordForm = document.getElementById('forgotPasswordForm');
const resetPasswordForm = document.getElementById('resetPasswordForm');

const faultForm = document.getElementById('faultForm');
const tenantMessage = document.getElementById('tenantMessage');
const myFaultsBody = document.getElementById('myFaultsBody');
const myFaultsEmpty = document.getElementById('myFaultsEmpty');

const faultsBody = document.getElementById('faultsBody');
const landlordEmpty = document.getElementById('landlordEmpty');

let currentUser = null;
let pollHandle = null;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// --- Auth screen ---

tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  loginForm.hidden = false;
  registerForm.hidden = true;
  forgotPasswordLink.hidden = false;
});

tabRegister.addEventListener('click', () => {
  forgotPasswordLink.hidden = true;
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerForm.hidden = false;
  loginForm.hidden = true;
});

registerRole.addEventListener('change', () => {
  unitField.hidden = registerRole.value !== 'tenant';
});

function showLoginTabs() {
  tabLogin.hidden = false;
  tabRegister.hidden = false;
  forgotPasswordLink.hidden = false;
  loginForm.hidden = false;
  registerForm.hidden = true;
  forgotPasswordForm.hidden = true;
  resetPasswordForm.hidden = true;
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
}

forgotPasswordLink.addEventListener('click', () => {
  tabLogin.hidden = true;
  tabRegister.hidden = true;
  forgotPasswordLink.hidden = true;
  loginForm.hidden = true;
  forgotPasswordForm.hidden = false;
  authMessage.textContent = '';
});

backToLoginLink.addEventListener('click', () => {
  showLoginTabs();
  authMessage.textContent = '';
});

forgotPasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(forgotPasswordForm).entries());
  await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  forgotPasswordForm.reset();
  authMessage.textContent = 'If an account exists for that email, a reset link has been sent.';
});

const resetToken = new URLSearchParams(window.location.search).get('resetToken');
if (resetToken) {
  tabLogin.hidden = true;
  tabRegister.hidden = true;
  forgotPasswordLink.hidden = true;
  loginForm.hidden = true;
  resetPasswordForm.hidden = false;
}

resetPasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPassword = new FormData(resetPasswordForm).get('newPassword');
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: resetToken, newPassword }),
  });
  if (res.ok) {
    window.history.replaceState({}, '', window.location.pathname);
    resetPasswordForm.hidden = true;
    showLoginTabs();
    authMessage.textContent = 'Password updated. Log in with your new password.';
  } else {
    const { error } = await res.json();
    authMessage.textContent = `Error: ${error}`;
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(loginForm).entries());
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    authMessage.textContent = '';
    loginForm.reset();
    await refreshCurrentUser();
  } else {
    const { error } = await res.json();
    authMessage.textContent = `Error: ${error}`;
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(registerForm).entries());
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    const loginRes = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: body.email, password: body.password }),
    });
    if (loginRes.ok) {
      authMessage.textContent = '';
      registerForm.reset();
      await refreshCurrentUser();
      return;
    }
  }
  const { error } = await res.json();
  authMessage.textContent = `Error: ${error}`;
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  stopPolling();
  showLoginTabs();
  render();
});

// --- Rendering ---

function render() {
  userNav.hidden = !currentUser;
  authView.hidden = !!currentUser;
  tenantView.hidden = !(currentUser && currentUser.role === 'tenant');
  landlordView.hidden = !(currentUser && currentUser.role === 'landlord');
  unreadBadge.hidden = true;

  if (currentUser) {
    userLabel.textContent = `${currentUser.name} (${currentUser.role})`;
    if (currentUser.role === 'tenant') {
      loadMyFaults();
    } else {
      loadFaults();
      refreshUnreadCount();
    }
    startPolling();
  }
}

async function refreshCurrentUser() {
  const res = await fetch('/api/auth/me');
  currentUser = await res.json();
  render();
}

function startPolling() {
  stopPolling();
  if (currentUser && currentUser.role === 'landlord') {
    pollHandle = setInterval(refreshUnreadCount, 5000);
  }
}

function stopPolling() {
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = null;
}

// --- Tenant view ---

faultForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(faultForm).entries());

  const res = await fetch('/api/faults', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    faultForm.reset();
    tenantMessage.textContent = 'Fault reported. The landlord has been alerted.';
    loadMyFaults();
  } else {
    const { error } = await res.json();
    tenantMessage.textContent = `Error: ${error}`;
  }
});

async function loadMyFaults() {
  const res = await fetch('/api/faults/mine');
  if (!res.ok) return;
  const faults = await res.json();

  myFaultsBody.innerHTML = '';
  myFaultsEmpty.hidden = faults.length > 0;

  for (const fault of faults) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(fault.title)}</td>
      <td>${escapeHtml(fault.description)}</td>
      <td class="status-${fault.status}">${fault.status}</td>
      <td>${new Date(fault.createdAt).toLocaleString()}</td>
    `;
    myFaultsBody.appendChild(row);
  }
}

// --- Landlord view ---

async function loadFaults() {
  const res = await fetch('/api/faults');
  if (!res.ok) return;
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
  if (!res.ok) return;
  const { count } = await res.json();
  unreadBadge.hidden = count === 0;
  unreadBadge.textContent = count;
}

refreshCurrentUser();
