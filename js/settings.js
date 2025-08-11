import { auth, db, showNotification, backToMenu, userSettings, doc, updateDoc } from './app.js';

document.getElementById('settings-back-to-menu-btn').addEventListener('click', backToMenu);

document.getElementById('save-settings-btn').addEventListener('click', async () => {
  const userId = auth.currentUser?.uid;
  if (!userId) return;
  const newSettings = {
    blinkMinutes: parseInt(document.getElementById('blink-minutes-input').value) || 5,
    scrollSpeed: parseInt(document.getElementById('scroll-speed-input').value) || 3,
    viewerSize: parseInt(document.getElementById('viewer-size-input').value) || 3,
    calculatorSize: parseInt(document.getElementById('calculator-size-input').value) || 3,
    viewerFooterText: document.getElementById('viewer-text-input').value || "⬅️ para retirar",
    viewerFooterSize: parseInt(document.getElementById('viewer-footer-size-input').value) || 2,
  };
  const sessionDocRef = doc(db, 'sessions', userId);
  await updateDoc(sessionDocRef, { settings: newSettings });
  showNotification('Configuración guardada.');
  backToMenu();
});
