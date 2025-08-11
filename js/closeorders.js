import { renderCloseOrders, setActiveFilter, activeFilter, closeGroupsEl, backToMenu, completeCode } from './app.js';

document.getElementById('closeorders-back-to-menu-btn').addEventListener('click', backToMenu);

document.querySelectorAll('.co-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.co-filter').forEach(b => b.classList.remove('tab-active'));
    btn.classList.add('tab-active');
    setActiveFilter(btn.dataset.filter || 'all');
    renderCloseOrders(activeFilter);
  });
});

if (closeGroupsEl) {
  closeGroupsEl.addEventListener('click', (e) => {
    const finishBtn = e.target.closest('.finish-item');
    if (finishBtn) {
      const id = finishBtn.dataset.id;
      if (id) completeCode(id);
    }
  });
}
