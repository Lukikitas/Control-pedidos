import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

async function loadTemplates() {
  const templates = ['login','role-selection','operator','viewer','closeorders','history','settings','notification','calculator','rappicargo'];
  const container = document.getElementById('app-container');
  for (const name of templates) {
    const res = await fetch(`templates/${name}.html`);
    container.insertAdjacentHTML('beforeend', await res.text());
  }
}
await loadTemplates();

const { jsPDF } = window.jspdf;

const firebaseConfig = {
    apiKey: "AIzaSyBy67VQbcGPHMnNLoa7mZugUWiAc89Juvg",
    authDomain: "vis-de-pedidos.firebaseapp.com",
    projectId: "vis-de-pedidos",
    storageBucket: "vis-de-pedidos.appspot.com",
    messagingSenderId: "302899841975",
    appId: "1:302899841975:web:e35f1d730dece0cab53632",
    measurementId: "G-2YDJHXG8E2"
  };

  let app, auth, db;
  let unsubscribeFromCodes = null;
  let sessionData = { codes: [], history: [], settings: {} };
  let currentSource = null;
  function setCurrentSource(source) { currentSource = source; }
  let notificationTimeout;
  let scrollInterval = null;
  let scrollPauseTimeout = null;
  let oldOrdersInterval = null;
  let previousCodesCount = 0;
  let userSettings = {
    blinkMinutes: 5,
    scrollSpeed: 3,
    viewerSize: 3,
    calculatorSize: 3,
    viewerFooterText: "⬅️ para retirar",
    viewerFooterSize: 3,
  };

  const loginView = document.getElementById('login-view');
  const roleSelectionView = document.getElementById('role-selection-view');
  const mainView = document.getElementById('main-view');

  const operatorView = document.getElementById('operator-view');
  const viewerView = document.getElementById('viewer-view');
  const closeOrdersView = document.getElementById('closeorders-view');
  const historyView = document.getElementById('history-view');
  const settingsView = document.getElementById('settings-view');

  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) { showNotification("Error de configuración de Firebase.", "error"); }

  function showView(viewToShow) {
    [loginView, roleSelectionView, mainView].forEach(v => v.classList.add('hidden'));
    viewToShow.classList.remove('hidden');
  }

  onAuthStateChanged(auth, user => {
    if (user) {
      const savedRole = localStorage.getItem('userRole');
      if (savedRole) {
        setupRoleView(savedRole);
      } else {
        document.getElementById('welcome-email').textContent = `Sesión iniciada como: ${user.email}`;
        showView(roleSelectionView);
      }
      listenForCodes(user.uid);
    } else {
      if (unsubscribeFromCodes) unsubscribeFromCodes();
      if (oldOrdersInterval) clearInterval(oldOrdersInterval);
      localStorage.removeItem('userRole');
      previousCodesCount = 0;
      document.documentElement.classList.remove('dark');
      showView(loginView);
    }
  });

  async function handleAuth(action, email, password) {
    try {
      if (action === 'register') await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
    } catch (error) { handleAuthError(error); }
  }


  function setupRoleView(role) {
    localStorage.setItem('userRole', role);
    showView(mainView);
    operatorView.classList.toggle('hidden', role !== 'operator');
    viewerView.classList.toggle('hidden', role !== 'viewer');
    closeOrdersView.classList.toggle('hidden', role !== 'closeorders');
    historyView.classList.toggle('hidden', role !== 'history');
    settingsView.classList.toggle('hidden', role !== 'settings');

    if (role === 'settings') populateSettingsForm();

    if (role === 'viewer') {
      document.documentElement.classList.remove('dark');
      updateViewerAutoScroll();
    } else {
      if (scrollInterval) {
        clearInterval(scrollInterval);
        clearTimeout(scrollPauseTimeout);
        scrollInterval = null;
      }
      if (localStorage.getItem('theme') === 'dark') {
        document.documentElement.classList.add('dark');
      }
    }

    if (role === 'closeorders') {
      renderCloseOrders(activeFilter);
    }
  }


  async function handleLogout() {
    const userId = auth.currentUser?.uid;
    if (userId && localStorage.getItem('userRole') === 'operator') {
      const sessionDocRef = doc(db, "sessions", userId);
      await updateDoc(sessionDocRef, { codes: [] });
    }
    signOut(auth);
  }


  function listenForCodes(userId) {
    if (unsubscribeFromCodes) unsubscribeFromCodes();
    const sessionDocRef = doc(db, "sessions", userId);

    getDoc(sessionDocRef).then(docSnap => {
      if (!docSnap.exists()) {
        setDoc(sessionDocRef, { createdAt: serverTimestamp(), codes: [], history: [], settings: userSettings });
      }
    });

    unsubscribeFromCodes = onSnapshot(sessionDocRef, (docSnap) => {
      if (docSnap.exists()) {
        sessionData = docSnap.data();
        sessionData.codes = sessionData.codes || [];
        sessionData.history = sessionData.history || [];
        userSettings = { ...userSettings, ...sessionData.settings };

        const isNewCode = sessionData.codes.length > previousCodesCount;
        previousCodesCount = sessionData.codes.length;

        const operatorCodes = [...sessionData.codes].sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
        const viewerCodes = [...sessionData.codes].sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        sessionData.history.sort((a, b) => (b.deletedAt?.seconds || 0) - (a.deletedAt?.seconds || 0));

        renderOperatorList(operatorCodes);
        renderViewerList(viewerCodes, isNewCode);
        filterAndRenderHistory();
        if (!closeOrdersView.classList.contains('hidden')) renderCloseOrders(activeFilter);
      }
    });
  }

  // === Antiduplicados ===
  function isDuplicate(code, source) {
    if (!code || !source) return false;
    const normalized = String(code).trim();
    return (sessionData.codes || []).some(c => String(c.code).trim() === normalized && c.source === source);
  }

  async function addCode(code, source, type = 'code') {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const codeTrim = String(code).trim();
    if (!codeTrim || !source) {
      showNotification("Ingresa un código y selecciona un origen", "error");
      return;
    }

    if (isDuplicate(codeTrim, source)) {
      showNotification("Este pedido ya fue ingresado", "error");
      return;
    }

    const newCode = { id: crypto.randomUUID(), code: codeTrim, source, timestamp: new Date(), type };
    const sessionDocRef = doc(db, "sessions", userId);
    await updateDoc(sessionDocRef, { codes: [newCode, ...sessionData.codes] });
  }

  async function deleteCode(codeId) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    const codeToMove = sessionData.codes.find(c => c.id === codeId);
    if (!codeToMove) return;

    codeToMove.deletedAt = new Date();
    const newCodesArray = sessionData.codes.filter(c => c.id !== codeId);
    const newHistoryArray = [codeToMove, ...sessionData.history];

    const sessionDocRef = doc(db, "sessions", userId);
    await updateDoc(sessionDocRef, { codes: newCodesArray, history: newHistoryArray });
  }

  async function completeCode(codeId) {
    await deleteCode(codeId);
    showNotification('Pedido marcado como FINALIZADO.');
  }

  function renderOperatorList(codes) {
    const listEl = document.getElementById('operator-code-list');
    listEl.innerHTML = '';
    if (oldOrdersInterval) clearInterval(oldOrdersInterval);

    if (codes.length === 0) {
      listEl.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-center mt-16">No hay pedidos activos.</p>`;
      return;
    }
    const now = Date.now();
    const alertTime = userSettings.blinkMinutes * 60 * 1000;

    codes.forEach(c => {
      const isOld = c.timestamp?.toDate && (now - c.timestamp.toDate().getTime() > alertTime);
      const sourceStyles = {
        'PedidosYa': 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300',
        'Rappi': 'bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300',
        'RappiCargo': 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300',
        'MercadoPago': 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300'
      };
      const style = sourceStyles[c.source] || 'bg-gray-100';
      const blinkingClass = isOld ? 'blinking-border' : '';

      listEl.innerHTML += `
        <div class="flex items-center justify-between p-3 ${style} rounded-lg ${blinkingClass}">
          <div class="flex flex-col">
            <span class="font-mono text-2xl tracking-wider font-bold">${c.code}</span>
            <span class="text-xs font-semibold">${c.source}</span>
          </div>
          <button data-id="${c.id}" class="delete-btn ml-auto p-2 rounded-full hover:bg-red-200 dark:hover:bg-red-800/50" title="Mover a historial">
            <svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>`;
    });

    oldOrdersInterval = setInterval(() => renderOperatorList(sessionData.codes), 60000);
  }

  function renderViewerList(codes, isNewCode) {
    const listEl = document.getElementById('viewer-code-list');
    listEl.innerHTML = '';
    if (codes.length === 0) {
      listEl.innerHTML = `<p class="viewer-no-codes text-gray-500 text-center mt-32 text-2xl col-span-full">Esperando pedidos...</p>`;
      updateViewerAutoScroll();
      return;
    }

    const sourceStyles = {
      'PedidosYa': 'bg-red-600 text-white',
      'Rappi': 'bg-sky-500 text-white',
      'RappiCargo': 'bg-sky-500 text-white',
      'MercadoPago': 'bg-yellow-400 text-black'
    };
    const sizeClasses = ['text-5xl md:text-6xl', 'text-6xl md:text-7xl', 'text-7xl md:text-8xl', 'text-8xl', 'text-8xl lg:text-9xl'];

    codes.forEach((c, index) => {
      let sizeClass = sizeClasses[userSettings.viewerSize - 1] || sizeClasses[2];
      if (c.type === 'name') sizeClass = 'text-4xl md:text-5xl';

      const displaySource = c.source === 'RappiCargo' ? 'Rappi' : c.source;
      const style = sourceStyles[c.source] || 'bg-gray-200';
      const card = document.createElement('div');
      card.className = 'bg-white rounded-xl shadow-lg p-4 flex flex-col items-center justify-center aspect-video';
      if (index === 0 && isNewCode) card.classList.add('new-order-pop');
      card.innerHTML = `
        <p class="font-black text-gray-900 ${sizeClass} tracking-tighter">${c.code}</p>
        <div class="mt-4 px-6 py-2 rounded-lg ${style}"><p class="font-bold text-xl">${displaySource}</p></div>`;
      listEl.appendChild(card);
    });

    const footerTextEl = document.getElementById('viewer-footer-text');
    footerTextEl.textContent = userSettings.viewerFooterText;
    const footerSizeClasses = ['text-xl py-3', 'text-2xl py-4', 'text-3xl py-5'];
    footerTextEl.className = `text-center font-bold flex-shrink-0 bg-gray-100 dark:bg-gray-900 ${footerSizeClasses[userSettings.viewerFooterSize - 1] || footerSizeClasses[1]}`;

    updateViewerAutoScroll();
  }

  function updateViewerAutoScroll() {
    const listEl = document.getElementById('viewer-code-list');
    if (scrollInterval) clearInterval(scrollInterval);
    if (scrollPauseTimeout) clearTimeout(scrollPauseTimeout);
    scrollInterval = null;

    if (viewerView.classList.contains('hidden')) return;

    setTimeout(() => {
      const hasOverflow = listEl.scrollHeight > listEl.clientHeight;
      if (hasOverflow) {
        let direction = 1;
        let paused = true;
        const speeds = [50, 40, 30, 20, 10];
        const scrollSpeedMs = speeds[userSettings.scrollSpeed - 1] || 30;
        const startScrollCycle = () => {
          scrollPauseTimeout = setTimeout(() => {
            paused = false;
            scrollInterval = setInterval(() => {
              if (paused) return;
              listEl.scrollBy(0, direction);
              const atBottom = listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 1;
              const atTop = listEl.scrollTop <= 0;
              if ((direction === 1 && atBottom) || (direction === -1 && atTop)) {
                paused = true;
                direction *= -1;
                clearInterval(scrollInterval);
                startScrollCycle();
              }
            }, scrollSpeedMs);
          }, 3000);
        };
        startScrollCycle();
      }
    }, 500);
  }

  function renderHistoryList(history) {
    const tableBody = document.getElementById('history-table-body');
    tableBody.innerHTML = '';
    if (history.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-8">No hay historial de pedidos.</td></tr>`;
      return;
    }
    history.forEach(c => {
      const created = c.timestamp?.toDate ? c.timestamp.toDate() : null;
      const deleted = c.deletedAt?.toDate ? c.deletedAt.toDate() : null;
      let duration = 'N/A';
      if (created && deleted) {
        const diffMs = deleted - created;
        const diffMins = Math.floor(diffMs / 60000);
        const diffSecs = Math.floor((diffMs % 60000) / 1000);
        duration = `${diffMins} min, ${diffSecs} seg`;
      }

      tableBody.innerHTML += `
        <tr class="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
          <th scope="row" class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">${c.code}</th>
          <td class="px-6 py-4">${c.source}</td>
          <td class="px-6 py-4">${created ? created.toLocaleString() : 'N/A'}</td>
          <td class="px-6 py-4">${deleted ? deleted.toLocaleString() : 'N/A'}</td>
          <td class="px-6 py-4">${duration}</td>
        </tr>`;
    });
  }

  function filterAndRenderHistory() {
    const searchTerm = document.getElementById('history-search-input').value.toLowerCase();
    const filterValue = document.getElementById('history-filter-select').value;

    const filteredHistory = (sessionData.history || []).filter(item => {
      const codeMatch = String(item.code).toLowerCase().includes(searchTerm);
      const filterMatch = filterValue === 'all' || item.source === filterValue;
      return codeMatch && filterMatch;
    });
    renderHistoryList(filteredHistory);
  }

  // ====== Cierre pedidos (agrupado, sin "Finalizar todos") ======
  const closeGroupsEl = document.getElementById('closeorders-groups');
  let activeFilter = 'all';
  function setActiveFilter(f) { activeFilter = f; }

  function getSourceStyles(source) {
    const map = {
      'PedidosYa': { badge:'bg-red-600 text-white', border:'border-red-300', light:'bg-red-50 dark:bg-red-900/20' },
      'Rappi': { badge:'bg-orange-500 text-white', border:'border-orange-300', light:'bg-orange-50 dark:bg-orange-900/20' },
      'RappiCargo': { badge:'bg-sky-500 text-white', border:'border-sky-300', light:'bg-sky-50 dark:bg-sky-900/20' },
      'MercadoPago': { badge:'bg-green-500 text-white', border:'border-green-300', light:'bg-green-50 dark:bg-green-900/20' }
    };
    return map[source] || { badge:'bg-gray-500 text-white', border:'border-gray-300', light:'bg-gray-50 dark:bg-gray-800' };
  }

  function groupBySource(codes) {
    return (codes || []).reduce((acc, c) => {
      const key = c.source || 'Otros';
      (acc[key] = acc[key] || []).push(c);
      return acc;
    }, {});
  }

  function renderCloseOrders(filter='all') {
    if (!closeGroupsEl) return;
    const grouped = groupBySource(sessionData.codes || []);
    const order = ['PedidosYa','Rappi','RappiCargo','MercadoPago'];
    const keys = Object.keys(grouped).sort((a,b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    closeGroupsEl.innerHTML = '';
    let renderedAny = false;

    keys.forEach(source => {
      const items = grouped[source] || [];
      if (!items.length) return;
      if (filter !== 'all' && filter !== source) return;

      renderedAny = true;
      const st = getSourceStyles(source);
      const wrap = document.createElement('div');
      wrap.className = `rounded-xl border ${st.border} ${st.light} p-3 sm:p-4`;

      const sorted = items.slice().sort((a,b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

      wrap.innerHTML = `
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2">
            <span class="co-badge ${st.badge}">${source}</span>
            <span class="text-sm font-semibold opacity-80">${sorted.length} activo${sorted.length!==1?'s':''}</span>
          </div>
        </div>

        <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          ${sorted.map(i => `
            <div class="co-card bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4 flex items-center justify-between">
              <div class="min-w-0">
                <p class="font-black text-2xl tracking-tight truncate">${i.code}</p>
                <p class="text-xs text-gray-500">${i.type === 'name' ? 'Nombre' : 'Código'} • ${new Date((i.timestamp?.seconds||0)*1000).toLocaleTimeString()}</p>
              </div>
              <button class="finish-item bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm co-btn" data-id="${i.id}">
                Finalizar
              </button>
            </div>
          `).join('')}
        </div>
      `;
      closeGroupsEl.appendChild(wrap);
    });

    if (!renderedAny) {
      closeGroupsEl.innerHTML = `<p class="text-gray-500 text-center py-12">No hay pedidos activos.</p>`;
    }
  }


  // Navegación común
  function backToMenu() { localStorage.removeItem('userRole'); showView(roleSelectionView); }



  // Ajustes
  function populateSettingsForm() {
    document.getElementById('blink-minutes-input').value = userSettings.blinkMinutes;
    document.getElementById('scroll-speed-input').value = userSettings.scrollSpeed;
    document.getElementById('viewer-size-input').value = userSettings.viewerSize;
    document.getElementById('calculator-size-input').value = userSettings.calculatorSize;
    document.getElementById('viewer-text-input').value = userSettings.viewerFooterText;
    document.getElementById('viewer-footer-size-input').value = userSettings.viewerFooterSize;
  }



  // Utilidades
  function showNotification(message, type = 'success') {
    const modal = document.getElementById('notification-modal');
    if (!modal) return;
    document.getElementById('notification-message').textContent = message;
    modal.className = 'hidden fixed top-5 right-5 border rounded-lg shadow-lg px-6 py-4 z-50 transition-transform duration-300 translate-x-full';
    const classesToAdd = type === 'error' ? ['bg-red-100', 'dark:bg-red-900/50'] : ['bg-white', 'dark:bg-gray-700'];
    modal.classList.add(...classesToAdd);
    void modal.offsetWidth;
    modal.classList.remove('translate-x-full');
    clearTimeout(notificationTimeout);
    notificationTimeout = setTimeout(() => modal.classList.add('translate-x-full'), 4000);
  }

  function handleAuthError(error) {
    let message = "Ocurrió un error.";
    switch (error.code) {
      case 'auth/user-not-found': message = "No se encontró un usuario con ese correo."; break;
      case 'auth/wrong-password': message = "Contraseña incorrecta."; break;
      case 'auth/email-already-in-use': message = "El correo electrónico ya está registrado."; break;
      case 'auth/weak-password': message = "La contraseña debe tener al menos 6 caracteres."; break;
      case 'auth/invalid-email': message = "El correo electrónico no es válido."; break;
    }
    showNotification(message, "error");
  }

  export {
    auth,
    db,
    sessionData,
    userSettings,
    currentSource,
    setCurrentSource,
    loginView,
    roleSelectionView,
    mainView,
    operatorView,
    viewerView,
    closeOrdersView,
    historyView,
    settingsView,
    closeGroupsEl,
    activeFilter,
    setActiveFilter,
    showView,
    handleAuth,
    setupRoleView,
    handleLogout,
    listenForCodes,
    addCode,
    deleteCode,
    completeCode,
    renderOperatorList,
    renderViewerList,
    updateViewerAutoScroll,
    renderHistoryList,
    filterAndRenderHistory,
    renderCloseOrders,
    backToMenu,
    showNotification,
    handleAuthError,
    jsPDF,
    doc,
    updateDoc
  };
  // Load view-specific modules after templates are inserted
  await Promise.all([
    import('./login.js'),
    import('./operator.js'),
    import('./viewer.js'),
    import('./closeorders.js'),
    import('./history.js'),
    import('./settings.js'),
    import('./calculator.js'),
    import('./rappicargo.js')
  ]);
