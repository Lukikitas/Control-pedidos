import { addCode, deleteCode, showNotification, setCurrentSource, backToMenu, currentSource } from './app.js';

document.getElementById('op-back-to-menu-btn').addEventListener('click', backToMenu);

document.querySelectorAll('.keypad-btn').forEach(btn => btn.addEventListener('click', () => {
  const display = document.getElementById('code-display');
  if (display.textContent.length < 4) display.textContent += btn.textContent;
}));

document.getElementById('clear-btn').addEventListener('click', () => document.getElementById('code-display').textContent = '');

document.getElementById('backspace-btn').addEventListener('click', () => {
  const display = document.getElementById('code-display');
  display.textContent = display.textContent.slice(0, -1);
});

document.querySelectorAll('.source-btn').forEach(btn => btn.addEventListener('click', () => {
  const source = btn.dataset.source;
  if (source === 'RappiCargo') {
    document.getElementById('rappicargo-overlay').classList.remove('hidden');
    document.getElementById('rappicargo-modal').classList.add('open');
  } else {
    document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setCurrentSource(source);
  }
}));

document.getElementById('submit-code-btn').addEventListener('click', () => {
  const code = document.getElementById('code-display').textContent;
  if (code && currentSource) {
    addCode(code, currentSource);
    document.getElementById('code-display').textContent = '';
    document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
    setCurrentSource(null);
  } else {
    showNotification("Ingresa un código y selecciona un origen", "error");
  }
});

document.getElementById('operator-code-list').addEventListener('click', e => {
  const deleteBtn = e.target.closest('.delete-btn');
  if (deleteBtn) deleteCode(deleteBtn.dataset.id);
});
