import { handleAuth, setupRoleView, handleLogout } from './app.js';

document.getElementById('login-form').addEventListener('submit', e => {
  e.preventDefault();
  handleAuth('login', document.getElementById('email-input').value, document.getElementById('password-input').value);
});

document.getElementById('register-btn').addEventListener('click', () => {
  handleAuth('register', document.getElementById('email-input').value, document.getElementById('password-input').value);
});

document.getElementById('select-operator-btn').addEventListener('click', () => setupRoleView('operator'));
document.getElementById('select-viewer-btn').addEventListener('click', () => setupRoleView('viewer'));
document.getElementById('select-history-btn').addEventListener('click', () => setupRoleView('history'));
document.getElementById('select-settings-btn').addEventListener('click', () => setupRoleView('settings'));
document.getElementById('select-closeorders-btn').addEventListener('click', () => setupRoleView('closeorders'));

[
  document.getElementById('role-logout-btn'),
  document.getElementById('op-logout-btn'),
  document.getElementById('viewer-logout-btn'),
  document.getElementById('history-logout-btn'),
  document.getElementById('closeorders-logout-btn')
].forEach(btn => btn?.addEventListener('click', handleLogout));
