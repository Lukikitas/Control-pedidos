import { filterAndRenderHistory, jsPDF, auth, db, showNotification, backToMenu, doc, updateDoc } from './app.js';

document.getElementById('history-back-to-menu-btn').addEventListener('click', backToMenu);

document.getElementById('history-search-input').addEventListener('input', filterAndRenderHistory);
document.getElementById('history-filter-select').addEventListener('change', filterAndRenderHistory);

document.getElementById('export-pdf-btn').addEventListener('click', () => {
  const d = new jsPDF();
  d.autoTable({ html: '#history-table' });
  d.save('historial-pedidos.pdf');
});

document.getElementById('delete-history-btn').addEventListener('click', async () => {
  const userId = auth.currentUser?.uid;
  if (!userId) return;
  if (confirm("¿Borrar todo el historial? Esta acción no se puede deshacer.")) {
    const sessionDocRef = doc(db, 'sessions', userId);
    await updateDoc(sessionDocRef, { history: [] });
    showNotification('Historial borrado correctamente.');
  }
});
