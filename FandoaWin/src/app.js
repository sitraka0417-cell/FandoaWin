(() => {
  'use strict';
  const M = window.Model;
  const api = window.api;
  const root = document.getElementById('root');
  const modals = document.getElementById('modals');
  const toasts = document.getElementById('toasts');

  /* ------------------------------------------------------------ utilitaires DOM */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'required') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const $ = (s, r) => (r || document).querySelector(s);
  const setContent = (el, ...kids) => el.replaceChildren(...kids.filter(Boolean));

  const ICONS = {
    pay: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6.5 15h4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.2.6 3.5 2.4 3.5 5.7"/>',
    settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    bell: '<path d="M6 17v-6a6 6 0 0 1 12 0v6l2 2H4l2-2zM10 21h4"/>',
    alarm: '<circle cx="12" cy="13" r="7"/><path d="M12 9v4l2.5 2M5 4L2.5 6.5M19 4l2.5 2.5"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    down: '<path d="M12 4v11M7.5 11L12 15.5 16.5 11M5 20h14"/>',
    out: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9"/>',
    repeat: '<path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"/>',
    sync: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>',
    file: '<path d="M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    cloudoff: '<path d="M3 3l18 18M17 17H8a5 5 0 0 1-1.5-9.8M10 6.2A6 6 0 0 1 18 11a4 4 0 0 1 2 6"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z"/><path d="M9 12l2.2 2.2L15 10"/>'
  };
  function icon(name) {
    const s = h('span', { class: 'ico', 'aria-hidden': 'true' });
    s.innerHTML = '<svg viewBox="0 0 24 24">' + (ICONS[name] || '') + '</svg>'; // contenu statique de confiance
    return s;
  }
  const GOOGLE_G = '<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

  function avatar(user, size, extra) {
    const base = (user && (user.name || user.email)) || '?';
    const el = h('span', { class: 'avatar ' + (extra || ''), style: size ? { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.42) + 'px' } : null },
      (base.trim()[0] || '?').toUpperCase());
    if (user && user.photoUrl) {
      const img = h('img', { src: user.photoUrl, alt: '', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => img.remove());
      el.append(img);
    }
    return el;
  }

  function toast(msg, kind) {
    const t = h('div', { class: 'toast ' + (kind || '') }, msg);
    toasts.append(t);
    setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3200);
  }

  /* ------------------------------------------------------------ fenêtres modales */
  const modalStack = [];
  function openModal(el, opts) {
    const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' }, el);
    const entry = { overlay, onClose: opts && opts.onClose };
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && !(opts && opts.sticky)) closeModal(entry); });
    modals.append(overlay);
    modalStack.push(entry);
    const first = overlay.querySelector('input:not([type=checkbox]),textarea,select,button.primary');
    if (first) setTimeout(() => first.focus(), 30);
    return entry;
  }
  function closeModal(entry) {
    const i = modalStack.indexOf(entry);
    if (i < 0) return;
    modalStack.splice(i, 1);
    entry.overlay.remove();
    if (entry.onClose) entry.onClose();
  }
  function closeAllModals() { while (modalStack.length) closeModal(modalStack[modalStack.length - 1]); }

  function confirmBox(title, text, okLabel, danger) {
    return new Promise((resolve) => {
      let entry;
      const done = (v) => { closeModal(entry); resolve(v); };
      const box = h('div', { class: 'modal sm' },
        h('div', { class: 'modal-head' }, h('h2', null, title)),
        h('div', { class: 'modal-body' }, h('p', null, text)),
        h('div', { class: 'modal-foot' },
          h('button', { class: 'btn', type: 'button', onclick: () => done(false) }, 'Annuler'),
          h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', onclick: () => done(true) }, okLabel)));
      entry = openModal(box, { onClose: () => resolve(false) });
    });
  }

  /* ------------------------------------------------------------ état */
  const S = {
    user: null, locked: false, pinEnabled: false, needsSecret: false, version: '',
    payments: [], people: [], offline: false, pending: 0, error: '',
    tab: 'pay', q: '', status: '', month: '', drawerId: null, settings: null, paint: null
  };

  const num = (v) => { const n = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const pad = (n) => String(n).padStart(2, '0');
  const toDateInput = (ms) => { if (ms == null) return ''; const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const toTimeInput = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fromDateInput = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  const combine = (ds, ts) => { const [y, m, d] = ds.split('-').map(Number); const [hh, mm] = (ts || '08:00').split(':').map(Number); return new Date(y, m - 1, d, hh, mm, 0, 0).getTime(); };
  const stClass = (p) => M.statusOf(p).toLowerCase();

  function applySnapshot(d) {
    if (!d) return;
    S.payments = d.payments || []; S.people = d.people || [];
    S.offline = !!d.offline; S.pending = d.pending || 0; S.error = d.error || '';
  }
  async function loadData() {
    const r = await api.list();
    if (r && !r.error) applySnapshot(r);
    S.settings = await api.settings();
  }

  async function boot() {
    Object.assign(S, await api.state());
    if (S.user && !S.locked) await loadData();
    route();
  }
  function route() {
    closeAllModals();
    S.drawerId = null;
    if (!S.user) return renderLogin();
    if (S.locked) return renderLock();
    renderShell();
  }

  /* ------------------------------------------------------------ verrouillage */
  function renderLock() {
    S.payments = []; S.people = [];
    const input = h('input', { type: 'password', inputmode: 'numeric', maxlength: '6', autocomplete: 'off', placeholder: 'Code PIN', 'aria-label': 'Code PIN' });
    const msg = h('div', { class: 'lock-msg', role: 'status' }, 'Entrez votre code PIN');
    const btn = h('button', { class: 'btn block', type: 'submit' }, 'Déverrouiller');
    let timer = null;
    function wait(sec) {
      input.disabled = true; btn.disabled = true;
      let left = sec;
      clearInterval(timer);
      const tick = () => {
        if (left <= 0) { clearInterval(timer); input.disabled = false; btn.disabled = false; msg.textContent = 'Entrez votre code PIN'; input.focus(); return; }
        msg.textContent = `Trop d'essais. Réessayez dans ${left} s`;
        left--;
      };
      tick(); timer = setInterval(tick, 1000);
    }
    async function submit() {
      const pin = input.value;
      if (pin.length < 4) { msg.textContent = 'Au moins 4 chiffres'; return; }
      const r = await api.unlock(pin);
      if (r && r.ok) return;
      input.value = '';
      if (r && r.wait) wait(r.wait);
      else msg.textContent = 'Code incorrect' + (r && r.left ? ` · ${r.left} essai${r.left > 1 ? 's' : ''} restant${r.left > 1 ? 's' : ''}` : '');
    }
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, ''); if (input.value.length === 6) submit(); });
    root.replaceChildren(h('div', { class: 'lock' },
      h('form', { class: 'lock-card', onsubmit: (e) => { e.preventDefault(); submit(); } },
        h('div', { class: 'logo' }, icon('lock')),
        h('h1', null, 'Fandoa'),
        msg, input, btn,
        h('button', { class: 'btn', type: 'button', style: { background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.4)' },
          onclick: async () => { if (await confirmBox('Se déconnecter ?', 'Vous devrez vous reconnecter avec Google. Vos données restent dans le cloud.', 'Se déconnecter', true)) api.signOut(); } },
          'Changer de compte'))));
    input.focus();
  }

  /* ------------------------------------------------------------ connexion */
  const LOGIN_ERRORS = {
    CANCELED: 'Connexion annulée.',
    TIMEOUT: 'Délai dépassé. Réessayez.',
    PORT_BUSY: "Le port 8765 est déjà utilisé par une autre application. Fermez-la puis réessayez.",
    DENIED: "Vous avez refusé l'accès.",
    NETWORK: 'Pas de connexion Internet.',
    BAD_SECRET: 'Le « client secret » Google est incorrect.',
    NEED_SECRET: 'Renseignez le client secret Google ci-dessous.',
    BUSY: 'Une connexion est déjà en cours.'
  };
  function renderLogin() {
    const err = h('div', { class: 'form-error', role: 'alert' });
    const btn = h('button', { class: 'gbtn', type: 'button' });
    const gIcon = h('span'); gIcon.innerHTML = GOOGLE_G;
    const cancel = h('button', { class: 'btn', type: 'button', onclick: () => api.cancelSignIn() }, 'Annuler');
    cancel.hidden = true;
    const setIdle = () => { btn.disabled = false; btn.replaceChildren(gIcon, 'Continuer avec Google'); cancel.hidden = true; };
    btn.addEventListener('click', async () => {
      err.textContent = '';
      btn.disabled = true; btn.textContent = 'Terminez la connexion dans votre navigateur…'; cancel.hidden = false;
      const r = await api.signIn();
      setIdle();
      if (r && r.error) {
        if (r.error === 'NEED_SECRET') { S.needsSecret = true; renderLogin(); return; }
        err.textContent = LOGIN_ERRORS[r.error] || ('Connexion impossible. ' + (r.message || ''));
      }
    });
    setIdle();

    let secretBox = null;
    if (S.needsSecret) {
      const sec = h('input', { type: 'password', autocomplete: 'off', placeholder: 'Client secret Google' });
      secretBox = h('div', { class: 'sect' },
        h('div', { class: 'label' }, 'Configuration requise (une seule fois)'),
        h('p', { class: 'muted' }, 'Collez le « client secret » du client Web de votre projet Firebase (Google Cloud → Identifiants).'),
        sec,
        h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          const r = await api.setSecret(sec.value);
          if (r && r.ok) { S.needsSecret = false; toast('Enregistré', 'ok'); renderLogin(); } else err.textContent = 'Valeur invalide.';
        } }, 'Enregistrer'));
    }
    const logo = h('div', { class: 'logo' }, icon('pay'));
    root.replaceChildren(h('div', { class: 'login' },
      h('div', { class: 'login-brand' },
        logo, h('h1', null, 'Fandoa'),
        h('p', null, 'Suivez les salaires et les paiements de votre équipe, simplement.'),
        h('ul', null,
          h('li', null, icon('check'), 'Paiements par tranches et rappels'),
          h('li', null, icon('sync'), 'Synchronisé avec votre application Android'),
          h('li', null, icon('shield'), 'Protégé par code PIN'))),
      h('div', { class: 'login-side' },
        h('div', { class: 'login-card' },
          h('h2', null, 'Bienvenue'),
          h('p', { class: 'muted' }, "Connectez-vous avec le même compte Google que sur votre téléphone pour retrouver vos données."),
          secretBox, btn, cancel, err))));
  }

  /* ------------------------------------------------------------ cadre principal */
  function renderShell() {
    const nav = (id, ic, label) => h('button', { class: S.tab === id ? 'on' : '', type: 'button', title: label,
      onclick: () => { S.tab = id; S.drawerId = null; renderShell(); } }, icon(ic), h('span', { class: 'label' }, label));
    const st = syncInfo();
    const sidebar = h('aside', { class: 'sidebar' },
      h('div', { class: 'brand' }, h('span', { class: 'logo' }, icon('pay')), h('span', { class: 'brand-name' }, 'Fandoa')),
      h('nav', { class: 'nav' }, nav('pay', 'pay', 'Paiements'), nav('ppl', 'users', 'Personnel'), nav('set', 'settings', 'Réglages')),
      h('div', { class: 'spacer' }),
      h('div', { class: 'syncstate ' + st.cls, id: 'syncstate', title: st.text }, h('span', { class: 'dot' }), h('span', { class: 'txt' }, st.text)),
      h('button', { class: 'usercard', type: 'button', title: 'Compte', onclick: () => { S.tab = 'set'; renderShell(); } },
        avatar(S.user, 36), h('div', { class: 'user-info' }, h('div', { class: 'nm ellipsis' }, S.user.name || 'Compte Google'), h('div', { class: 'em ellipsis' }, S.user.email))));

    const titles = { pay: 'Paiements', ppl: 'Personnel', set: 'Réglages' };
    const actions = h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
      h('button', { class: 'icon-btn', type: 'button', title: 'Synchroniser (F5)', onclick: doSync }, icon('sync')),
      S.pinEnabled ? h('button', { class: 'icon-btn', type: 'button', title: 'Verrouiller (Ctrl+L)', onclick: () => api.lock() }, icon('lock')) : null,
      S.tab === 'pay' ? h('button', { class: 'btn primary', type: 'button', onclick: () => paymentForm({}) }, icon('plus'), 'Nouveau paiement') : null,
      S.tab === 'ppl' ? h('button', { class: 'btn primary', type: 'button', onclick: () => personForm({}) }, icon('plus'), 'Nouvelle personne') : null);

    root.replaceChildren(h('div', { class: 'app' }, sidebar,
      h('div', { class: 'main' },
        h('header', { class: 'topbar' }, h('h1', { class: 'grow' }, titles[S.tab]), actions),
        h('main', { class: 'content', id: 'content' }),
        h('div', { id: 'drawerhost' }))));
    renderView();
  }
  function syncInfo() {
    if (S.error === 'PERMISSION') return { cls: 'err', text: 'Accès Firestore refusé' };
    if (S.offline) return { cls: 'off', text: 'Hors ligne' + (S.pending ? ` · ${S.pending} en attente` : '') };
    if (S.pending) return { cls: 'off', text: `${S.pending} en attente d'envoi` };
    return { cls: '', text: 'Synchronisé' };
  }
  function updateSyncState() {
    const el = $('#syncstate'); if (!el) return;
    const st = syncInfo();
    el.className = 'syncstate ' + st.cls; el.title = st.text;
    const t = el.querySelector('.txt'); if (t) t.textContent = st.text;
  }
  async function doSync() {
    const r = await api.sync();
    if (r && !r.error) { applySnapshot(r); onData(); toast(S.offline ? 'Hors ligne' : 'Synchronisé', S.offline ? 'err' : 'ok'); }
  }
  function renderView() {
    const c = $('#content'); if (!c) return;
    const top = c.scrollTop;
    S.paint = null;
    if (S.tab === 'pay') viewPay(c);
    else if (S.tab === 'ppl') viewPeople(c);
    else viewSettings(c);
    c.scrollTop = top;
    paintDrawer();
  }
  function onData() {
    updateSyncState();
    if (S.locked || !S.user) return;
    if (S.tab === 'pay' && S.paint) { S.paint(); paintDrawer(); }
    else if (S.tab === 'ppl') renderView();
  }
  function permBanner() {
    if (S.error !== 'PERMISSION') return null;
    return h('div', { class: 'banner err' }, icon('shield'), h('div', null,
      h('b', null, 'Accès refusé par Firestore. '),
      "Vérifiez que la base Firestore est créée et que les règles autorisent users/{uid}/** pour l'utilisateur connecté."));
  }

  /* ------------------------------------------------------------ vue paiements */
  function viewPay(content) {
    const q = h('input', { type: 'search', placeholder: 'Rechercher un nom ou un motif…  (Ctrl+F)', value: S.q, 'aria-label': 'Rechercher', id: 'search' });
    q.addEventListener('input', () => { S.q = q.value; paint(); });
    const monthSel = h('select', { 'aria-label': 'Mois' });
    monthSel.addEventListener('change', () => { S.month = monthSel.value; paint(); });
    const chips = h('div', { class: 'chips' });
    const kpis = h('div', { class: 'kpis' });
    const list = h('div', { class: 'grid' });
    setContent(content, permBanner(), h('div', { class: 'toolbar' }, h('div', { class: 'searchbox' }, icon('search'), q), monthSel), chips, kpis, list);

    function paint() {
      const months = [...new Set(S.payments.map(M.monthKey))].sort().reverse();
      if (S.month && !months.includes(S.month)) S.month = '';
      monthSel.replaceChildren(h('option', { value: '' }, 'Tous les mois'), ...months.map((m) => h('option', { value: m }, M.monthLabel(m))));
      monthSel.value = S.month;

      const ql = S.q.trim().toLowerCase();
      const base = S.payments.filter((p) => (!S.month || M.monthKey(p) === S.month) &&
        (!ql || p.name.toLowerCase().includes(ql) || p.reason.toLowerCase().includes(ql)));
      const shown = base.filter((p) => !S.status || M.statusOf(p) === S.status).sort((a, b) => {
        const rank = (p) => { const s = M.statusOf(p); return s === 'LATE' ? 0 : s === 'PAID' ? 2 : 1; };
        return rank(a) - rank(b) || (a.dueDate == null ? Infinity : a.dueDate) - (b.dueDate == null ? Infinity : b.dueDate);
      });

      chips.replaceChildren(...[['', 'Tous'], ['UNPAID', 'À payer'], ['PARTIAL', 'Partiel'], ['PAID', 'Payé'], ['LATE', 'En retard']].map(([k, label]) => {
        const n = k ? base.filter((p) => M.statusOf(p) === k).length : base.length;
        return h('button', { class: 'fchip' + (S.status === k ? ' on' : ''), type: 'button', onclick: () => { S.status = k; paint(); } }, `${label} · ${n}`);
      }));

      const total = base.reduce((s, p) => s + p.amount, 0);
      const paid = base.reduce((s, p) => s + M.paidOf(p), 0);
      const late = base.filter((p) => M.statusOf(p) === 'LATE');
      kpis.replaceChildren(
        h('div', { class: 'kpi hero' }, h('div', { class: 'l' }, 'Reste à payer'), h('div', { class: 'v' }, M.money(total - paid))),
        h('div', { class: 'kpi' }, h('div', { class: 'l' }, 'Total'), h('div', { class: 'v' }, M.money(total))),
        h('div', { class: 'kpi' }, h('div', { class: 'l' }, 'Déjà payé'), h('div', { class: 'v' }, M.money(paid))),
        h('div', { class: 'kpi late' }, h('div', { class: 'l' }, 'En retard'), h('div', { class: 'v' }, String(late.length))));

      if (!shown.length) {
        list.replaceChildren(h('div', { class: 'empty' }, icon('file'), h('b', null, S.payments.length ? 'Aucun résultat' : 'Aucun paiement'),
          S.payments.length ? 'Modifiez la recherche ou les filtres.' : 'Cliquez sur « Nouveau paiement » pour commencer.'));
      } else list.replaceChildren(...shown.map(payCard));
    }
    S.paint = paint;
    paint();
  }

  function payCard(p) {
    const st = M.statusOf(p), cls = st.toLowerCase(), paid = M.paidOf(p);
    const open = () => openDrawer(p.id);
    const el = h('div', { class: 'card pay', role: 'button', tabindex: '0', onclick: open,
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } },
      h('div', { class: 'row' },
        h('span', { class: 'avatar ' + cls }, (p.name.trim()[0] || '?').toUpperCase()),
        h('div', { class: 'grow' },
          h('div', { class: 'name ellipsis' }, p.name),
          h('div', { class: 'sub ellipsis' }, [p.category, p.reason].filter(Boolean).join(' · ')),
          p.dueDate != null ? h('div', { class: 'due' + (st === 'LATE' ? ' late' : '') }, icon('cal'), M.dFmt(p.dueDate),
            (p.alarm || p.notif) && p.reminderAt ? icon('alarm') : null) : null),
        h('div', { class: 'amt' }, h('div', { class: 'num' }, M.money(p.amount)), h('span', { class: 'chip ' + cls }, M.STATUS[st]))),
      paid > 0 && p.amount > 0 ? h('div', { class: 'progress' },
        h('div', { class: 'bar ' + cls }, h('i', { style: { width: Math.min(100, paid / p.amount * 100) + '%' } })),
        h('div', { class: 'pl' }, h('span', null, 'Payé ' + M.money(paid)), h('span', null, 'Reste ' + M.money(M.remainingOf(p))))) : null);
    return el;
  }

  /* ------------------------------------------------------------ tiroir de détail */
  function openDrawer(id) { S.drawerId = id; paintDrawer(); }
  function closeDrawer() { S.drawerId = null; paintDrawer(); }
  function paintDrawer() {
    const host = $('#drawerhost'); if (!host) return;
    const p = S.payments.find((x) => x.id === S.drawerId);
    if (!p) { host.replaceChildren(); S.drawerId = null; return; }
    const prev = host.querySelector('.drawer-body');
    const top = prev ? prev.scrollTop : 0;
    const st = M.statusOf(p), cls = st.toLowerCase(), paid = M.paidOf(p), rest = M.remainingOf(p);

    const save = async (np) => { const r = await api.savePayment(np); if (r && r.error) toast('Enregistrement impossible', 'err'); return r; };
    const body = h('div', { class: 'drawer-body' },
      h('div', { class: 'card panel' },
        h('div', { class: 'sumrow' }, h('span', null, 'Montant'), h('b', null, M.money(p.amount))),
        h('div', { class: 'sumrow' }, h('span', null, 'Déjà payé'), h('b', { style: { color: 'var(--paid)' } }, M.money(paid))),
        h('div', { class: 'sumrow' }, h('span', null, 'Reste à payer'), h('b', { style: { color: 'var(--' + cls + ')' } }, M.money(rest))),
        p.amount > 0 ? h('div', { class: 'bar ' + cls, style: { marginTop: '10px' } }, h('i', { style: { width: Math.min(100, paid / p.amount * 100) + '%' } })) : null),
      p.dueDate != null ? h('div', { class: 'info' }, icon('cal'), 'Échéance : ' + M.dFmt(p.dueDate)) : null,
      (p.alarm || p.notif) && p.reminderAt ? h('div', { class: 'info' }, icon(p.alarm ? 'alarm' : 'bell'), (p.alarm ? 'Alarme' : 'Notification') + ' : ' + M.dtFmt(p.reminderAt)) : null,
      p.monthly ? h('div', { class: 'info' }, icon('repeat'), 'Se répète chaque mois') : null,
      p.note ? h('div', { class: 'card panel' }, h('div', { class: 'label' }, 'Note'), h('div', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, p.note)) : null,
      p.tranches.length ? h('div', { class: 'card panel' }, h('h3', null, 'Historique des versements'),
        ...p.tranches.map((t, i) => h('div', { class: 'tr' },
          h('div', { class: 'grow' }, h('b', null, M.money(t.amount)), h('div', { class: 'muted' }, M.dFmt(t.date) + (t.note ? ' · ' + t.note : ''))),
          h('button', { class: 'icon-btn', type: 'button', title: 'Supprimer ce versement', onclick: async () => {
            if (await confirmBox('Supprimer ce versement ?', M.money(t.amount) + ' du ' + M.dFmt(t.date), 'Supprimer', true)) {
              save(Object.assign({}, p, { tranches: p.tranches.filter((_, j) => j !== i) }));
            } } }, icon('trash'))))) : null,
      !M.isPaid(p) ? h('div', { class: 'actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => save(Object.assign({}, p, { tranches: p.tranches.concat([{ amount: rest, date: Date.now(), note: '' }]) })) }, icon('check'), 'Marquer payé'),
        h('button', { class: 'btn', type: 'button', onclick: () => trancheForm(p) }, icon('plus'), 'Ajouter une tranche')) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: async () => { const r = await api.receiptPdf(p.id); if (r && r.ok) toast('Reçu enregistré', 'ok'); else if (r && r.error) toast('Échec de la création du reçu', 'err'); } }, icon('file'), 'Reçu PDF'),
        h('button', { class: 'btn', type: 'button', onclick: async () => { await api.copyText(receiptText(p)); toast('Reçu copié', 'ok'); } }, icon('copy'), 'Copier le reçu')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => paymentForm(p) }, icon('edit'), 'Modifier'),
        h('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await confirmBox('Supprimer ce paiement ?', 'Cette action est définitive et sera synchronisée sur tous vos appareils.', 'Supprimer', true)) { closeDrawer(); api.deletePayment(p.id); }
        } }, icon('trash'), 'Supprimer')));

    host.replaceChildren(h('div', { class: 'drawer-host' },
      h('div', { class: 'scrim', onclick: closeDrawer }),
      h('aside', { class: 'drawer', role: 'dialog', 'aria-label': 'Détail du paiement' },
        h('div', { class: 'drawer-head' },
          h('div', { class: 'grow' }, h('h2', { class: 'ellipsis' }, p.name), h('div', { class: 'muted ellipsis' }, [p.category, p.reason].filter(Boolean).join(' · '))),
          h('span', { class: 'chip ' + cls }, M.STATUS[st]),
          h('button', { class: 'icon-btn', type: 'button', title: 'Fermer (Échap)', onclick: closeDrawer }, icon('close'))),
        body)));
    body.scrollTop = top;
  }
  function receiptText(p) {
    const lines = ['REÇU DE PAIEMENT - Fandoa', '', 'Bénéficiaire : ' + p.name, 'Catégorie : ' + p.category];
    if (p.reason) lines.push('Motif : ' + p.reason);
    lines.push('Montant dû : ' + M.money(p.amount), 'Déjà payé : ' + M.money(M.paidOf(p)), 'Reste à payer : ' + M.money(M.remainingOf(p)));
    if (p.tranches.length) { lines.push('', 'Versements :'); p.tranches.forEach((t) => lines.push('• ' + M.dFmt(t.date) + ' : ' + M.money(t.amount))); }
    lines.push('', 'Statut : ' + M.STATUS[M.statusOf(p)]);
    return lines.join('\n');
  }

  /* ------------------------------------------------------------ formulaires */
  function field(label, input, hint) { return h('div', { class: 'field' }, h('label', null, label), input, hint ? h('small', { class: 'muted' }, hint) : null); }
  function switchRow(title, sub, checked, onChange) {
    const cb = h('input', { type: 'checkbox', checked: !!checked });
    cb.addEventListener('change', () => onChange && onChange(cb.checked));
    return { cb, el: h('div', { class: 'switchrow' }, h('div', { class: 'txt' }, h('div', null, title), sub ? h('small', null, sub) : null), h('label', { class: 'switch' }, cb, h('span', { class: 'track' }))) };
  }
  function segmented(options, current, onChange) {
    let cur = current;
    const wrap = h('div', { class: 'seg' });
    const draw = () => wrap.replaceChildren(...options.map(([v, label]) =>
      h('button', { type: 'button', class: cur === v ? 'on' : '', onclick: () => { cur = v; draw(); onChange && onChange(v); } }, label)));
    draw();
    return { el: wrap, get: () => cur };
  }
  function formShell(title, bodyKids, onSubmit, closeFn, extraFoot) {
    return h('form', { class: 'modal', novalidate: true, onsubmit: (e) => { e.preventDefault(); onSubmit(); } },
      h('div', { class: 'modal-head' }, h('h2', null, title),
        h('button', { class: 'icon-btn', type: 'button', title: 'Fermer', onclick: closeFn }, icon('close'))),
      h('div', { class: 'modal-body' }, bodyKids),
      h('div', { class: 'modal-foot' }, extraFoot, h('button', { class: 'btn', type: 'button', onclick: closeFn }, 'Annuler'),
        h('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer')));
  }

  function paymentForm(init) {
    const isNew = !init.id;
    let entry;
    const close = () => closeModal(entry);
    const err = h('div', { class: 'form-error', role: 'alert' });

    const name = h('input', { type: 'text', value: init.name || '', maxlength: '120', placeholder: 'Ex. Rakoto Jean' });
    let personId = init.personId || '';
    name.addEventListener('input', () => { personId = ''; });
    const amount = h('input', { type: 'text', inputmode: 'decimal', value: init.amount ? String(init.amount) : '', placeholder: '0' });
    const reason = h('input', { type: 'text', value: init.reason || '', maxlength: '200', placeholder: 'Ex. Salaire de novembre' });
    const note = h('textarea', { rows: '3', maxlength: '1000' }); note.value = init.note || '';
    const due = h('input', { type: 'date', value: toDateInput(init.dueDate) });
    const cat = segmented([['Salaire', 'Salaire'], ['Avance', 'Avance'], ['Prime', 'Prime'], ['Autre', 'Autre']], init.category || 'Salaire');

    const paidNow = M.paidOf({ tranches: init.tranches || [] });
    const startMode = init.id && M.isPaid(init) ? 1 : paidNow > 0 ? 2 : 0;
    const paidInput = h('input', { type: 'text', inputmode: 'decimal', value: paidNow > 0 ? String(paidNow) : '', placeholder: '0' });
    const restInfo = h('div', { class: 'muted' });
    const paidBox = h('div', { class: 'field' }, h('label', null, 'Déjà payé'), paidInput, restInfo);
    const updateRest = () => {
      const t = num(amount.value) || 0, p = Math.min(Math.max(num(paidInput.value) || 0, 0), t);
      restInfo.textContent = 'Reste à payer : ' + M.money(Math.max(t - p, 0));
    };
    paidInput.addEventListener('input', updateRest); amount.addEventListener('input', updateRest);
    const mode = segmented([[0, 'Non payé'], [1, 'Payé'], [2, 'Par tranches']], startMode, (v) => { paidBox.hidden = v !== 2; });
    paidBox.hidden = startMode !== 2; updateRest();

    const monthly = switchRow('Répéter chaque mois', 'Crée le paiement suivant une fois celui-ci soldé', init.monthly);
    const remDate = h('input', { type: 'date', value: init.reminderAt ? toDateInput(init.reminderAt) : '' });
    const remTime = h('input', { type: 'time', value: init.reminderAt ? toTimeInput(init.reminderAt) : '08:00' });
    const remBox = h('div', { class: 'row2' }, field('Date du rappel', remDate), field('Heure', remTime));
    let alarm, notif;
    const syncRem = () => {
      const on = alarm.cb.checked || notif.cb.checked;
      remBox.hidden = !on;
      if (on && !remDate.value) remDate.value = due.value || toDateInput(Date.now() + 86400000);
    };
    alarm = switchRow('Alarme sonore', "Sonne à la date et l'heure choisies", init.alarm, syncRem);
    notif = switchRow('Notification Windows', 'Dans la zone de notification', init.notif, syncRem);
    remBox.hidden = !(init.alarm || init.notif);

    const people = S.people.length && isNew ? h('div', { class: 'seg' }, ...S.people.map((pr) =>
      h('button', { type: 'button', title: 'Utiliser cette personne', onclick: () => {
        name.value = pr.name; personId = pr.id;
        if (!amount.value && pr.salary > 0) { amount.value = String(pr.salary); updateRest(); }
      } }, pr.name))) : null;

    function submit() {
      const amt = num(amount.value);
      if (!name.value.trim()) { err.textContent = 'Saisissez un nom.'; name.focus(); return; }
      if (!(amt > 0)) { err.textContent = 'Saisissez un montant valide (supérieur à 0).'; amount.focus(); return; }
      const m = mode.get();
      let target = m === 0 ? 0 : m === 1 ? amt : Math.min(Math.max(num(paidInput.value) || 0, 0), amt);
      const remOn = alarm.cb.checked || notif.cb.checked;
      let reminderAt = null;
      if (remOn) {
        if (!remDate.value) { err.textContent = 'Choisissez la date du rappel.'; remDate.focus(); return; }
        reminderAt = combine(remDate.value, remTime.value || '08:00');
      }
      const payload = Object.assign({}, init, {
        name: name.value.trim(), personId, category: cat.get(), amount: amt, reason: reason.value.trim(), note: note.value.trim(),
        dueDate: fromDateInput(due.value), reminderAt, alarm: alarm.cb.checked, notif: notif.cb.checked, monthly: monthly.cb.checked,
        tranches: M.adjustPaid(init.tranches || [], target), createdAt: init.createdAt || Date.now()
      });
      api.savePayment(payload).then((r) => {
        if (r && r.error) { err.textContent = r.error === 'LOCKED' ? 'Application verrouillée.' : 'Enregistrement impossible.'; return; }
        close();
      });
    }

    const form = formShell(isNew ? 'Nouveau paiement' : 'Modifier le paiement', [
      err,
      h('div', { class: 'sect' }, h('div', { class: 'label' }, 'Bénéficiaire'), field('Nom', name), people),
      h('div', { class: 'sect' }, h('div', { class: 'label' }, 'Paiement'), cat.el,
        h('div', { class: 'row2' }, field('Montant à payer (Ar)', amount), field('Motif du paiement', reason)), field('Note', note)),
      h('div', { class: 'sect' }, h('div', { class: 'label' }, "Date d'échéance (facultatif)"), due, monthly.el),
      h('div', { class: 'sect' }, h('div', { class: 'label' }, 'Mode de paiement'), mode.el, paidBox),
      h('div', { class: 'sect' }, h('div', { class: 'label' }, 'Rappels'), alarm.el, notif.el, remBox)
    ], submit, close);
    entry = openModal(form, { sticky: true });
  }

  function trancheForm(p) {
    let entry;
    const close = () => closeModal(entry);
    const err = h('div', { class: 'form-error' });
    const amt = h('input', { type: 'text', inputmode: 'decimal', value: String(M.remainingOf(p)) });
    const date = h('input', { type: 'date', value: toDateInput(Date.now()) });
    const note = h('input', { type: 'text', maxlength: '200', placeholder: 'Facultatif' });
    const form = formShell('Ajouter une tranche', [err, field('Montant versé (Ar)', amt), field('Date du versement', date), field('Note', note)], () => {
      const v = num(amt.value);
      if (!(v > 0)) { err.textContent = 'Montant invalide.'; return; }
      const when = date.value ? combine(date.value, '12:00') : Date.now();
      api.savePayment(Object.assign({}, p, { tranches: p.tranches.concat([{ amount: v, date: when, note: note.value.trim() }]) })).then(close);
    }, close);
    form.classList.add('sm');
    entry = openModal(form, { sticky: true });
  }

  /* ------------------------------------------------------------ personnel */
  function viewPeople(content) {
    const grid = h('div', { class: 'grid' });
    setContent(content, permBanner(), grid);
    if (!S.people.length) {
      grid.append(h('div', { class: 'empty' }, icon('users'), h('b', null, 'Aucune personne'), 'Ajoutez votre personnel avec « Nouvelle personne ».'));
      return;
    }
    const sorted = S.people.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    grid.append(...sorted.map((pr) => {
      const due = S.payments.filter((p) => p.personId === pr.id || (!p.personId && p.name.toLowerCase() === pr.name.toLowerCase()))
        .reduce((s, p) => s + M.remainingOf(p), 0);
      return h('div', { class: 'card person', role: 'button', tabindex: '0', onclick: () => personForm(pr),
        onkeydown: (e) => { if (e.key === 'Enter') personForm(pr); } },
        h('div', { class: 'row' }, h('span', { class: 'avatar tint' }, (pr.name.trim()[0] || '?').toUpperCase()),
          h('div', { class: 'grow' }, h('div', { class: 'name ellipsis' }, pr.name),
            h('div', { class: 'sub ellipsis' }, [pr.role, pr.phone].filter(Boolean).join(' · ')),
            pr.salary > 0 ? h('div', { class: 'sub' }, 'Salaire : ' + M.money(pr.salary)) : null,
            due > 0 ? h('div', { class: 'sub', style: { color: 'var(--late)' } }, 'Reste dû : ' + M.money(due)) : null),
          h('button', { class: 'btn sm primary', type: 'button', title: 'Nouveau paiement pour cette personne',
            onclick: (e) => { e.stopPropagation(); paymentForm({ name: pr.name, personId: pr.id, amount: pr.salary, category: 'Salaire' }); } }, icon('pay'), 'Payer')));
    }));
  }

  function personForm(init) {
    const isNew = !init.id;
    let entry;
    const close = () => closeModal(entry);
    const err = h('div', { class: 'form-error', role: 'alert' });
    const name = h('input', { type: 'text', value: init.name || '', maxlength: '120' });
    const role = h('input', { type: 'text', value: init.role || '', maxlength: '120', placeholder: 'Ex. Gardien, secrétaire…' });
    const phone = h('input', { type: 'text', value: init.phone || '', maxlength: '40' });
    const salary = h('input', { type: 'text', inputmode: 'decimal', value: init.salary ? String(init.salary) : '', placeholder: '0' });
    const del = !isNew ? h('button', { class: 'btn danger', type: 'button', style: { marginRight: 'auto' }, onclick: async () => {
      if (await confirmBox('Supprimer ' + init.name + ' ?', 'Ses paiements déjà enregistrés sont conservés.', 'Supprimer', true)) { await api.deletePerson(init.id); close(); }
    } }, icon('trash'), 'Supprimer') : null;
    const form = formShell(isNew ? 'Nouvelle personne' : 'Modifier la personne', [
      err, field('Nom', name), field('Poste / rôle', role),
      h('div', { class: 'row2' }, field('Téléphone', phone), field('Salaire mensuel (Ar)', salary))
    ], () => {
      if (!name.value.trim()) { err.textContent = 'Saisissez un nom.'; name.focus(); return; }
      const s = salary.value.trim() ? num(salary.value) : 0;
      if (Number.isNaN(s) || s < 0) { err.textContent = 'Salaire invalide.'; return; }
      api.savePerson(Object.assign({}, init, { name: name.value.trim(), role: role.value.trim(), phone: phone.value.trim(), salary: s, createdAt: init.createdAt || Date.now() })).then(close);
    }, close, del);
    form.classList.add('sm');
    entry = openModal(form, { sticky: true });
  }

  /* ------------------------------------------------------------ réglages */
  function viewSettings(content) {
    const set = S.settings || { trayOnClose: true, autostart: false, lockMinutes: 5, zoom: 0, version: S.version };
    const setting = (k, v) => api.setSetting(k, v).then((r) => { if (r && r.error) toast('Réglage refusé', 'err'); });

    const account = h('div', { class: 'panel' }, h('h3', null, 'Compte'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' } }, avatar(S.user, 52),
        h('div', { class: 'grow' }, h('b', null, S.user.name || 'Compte Google'), h('div', { class: 'muted' }, S.user.email), h('div', { style: { color: 'var(--paid)' } }, 'Synchronisé avec Firestore')),
        h('button', { class: 'btn', type: 'button', onclick: async () => {
          const warn = S.pending ? ` ${S.pending} modification(s) ne sont pas encore envoyées et seront perdues.` : '';
          if (await confirmBox('Se déconnecter ?', 'Vos données restent dans le cloud.' + warn, 'Se déconnecter', true)) api.signOut();
        } }, icon('out'), 'Se déconnecter')));

    const pinRow = h('div', { class: 'switchrow' },
      h('div', { class: 'txt' }, h('div', null, 'Code PIN'), h('small', null, S.pinEnabled ? 'Activé : protège l\'accès à l\'application' : 'Protège l\'accès à l\'application')),
      S.pinEnabled
        ? h('div', { class: 'actions', style: { flex: '0 0 auto' } },
          h('button', { class: 'btn sm', type: 'button', onclick: () => pinDialog('change') }, 'Modifier'),
          h('button', { class: 'btn sm danger', type: 'button', onclick: () => pinDialog('clear') }, 'Désactiver'))
        : h('button', { class: 'btn sm primary', type: 'button', onclick: () => pinDialog('set') }, 'Créer un code'));
    const lockSel = h('select', { 'aria-label': 'Verrouillage automatique' },
      ...[[0, 'Jamais'], [1, 'Après 1 minute'], [5, 'Après 5 minutes'], [15, 'Après 15 minutes'], [30, 'Après 30 minutes']].map(([v, l]) => h('option', { value: String(v) }, l)));
    lockSel.value = String(set.lockMinutes);
    lockSel.addEventListener('change', () => { set.lockMinutes = Number(lockSel.value); setting('lockMinutes', Number(lockSel.value)); });
    const security = h('div', { class: 'panel' }, h('h3', null, 'Sécurité'), pinRow,
      S.pinEnabled ? field("Verrouillage automatique (inactivité)", lockSel, "L'application se verrouille aussi à la réduction, à la mise en veille et au verrouillage de Windows.") : null);

    const tray = switchRow('Garder Fandoa actif à la fermeture', 'Réduit dans la zone de notification pour que les rappels continuent', set.trayOnClose, (v) => { set.trayOnClose = v; setting('trayOnClose', v); });
    const auto = switchRow('Lancer au démarrage de Windows', 'Démarre en arrière-plan', set.autostart, (v) => { set.autostart = v; setting('autostart', v); });
    const zoomTxt = h('span', null, Math.round(Math.pow(1.2, set.zoom) * 100) + ' %');
    const zoom = (d) => { set.zoom = d === 0 ? 0 : Math.max(-3, Math.min(4, set.zoom + d)); zoomTxt.textContent = Math.round(Math.pow(1.2, set.zoom) * 100) + ' %'; setting('zoom', set.zoom); };
    const appPanel = h('div', { class: 'panel' }, h('h3', null, 'Application'), tray.el, auto.el,
      h('div', { class: 'switchrow' }, h('div', { class: 'txt' }, h('div', null, "Taille de l'affichage"), h('small', null, 'Aussi avec Ctrl + / Ctrl − / Ctrl 0')),
        h('div', { class: 'zoomctl' }, h('button', { class: 'btn sm', type: 'button', onclick: () => zoom(-0.5) }, '−'), zoomTxt,
          h('button', { class: 'btn sm', type: 'button', onclick: () => zoom(0.5) }, '+'), h('button', { class: 'btn sm', type: 'button', onclick: () => zoom(0) }, 'Réinitialiser'))));

    const exp = async (fn, okMsg) => { const r = await fn(); if (r && r.ok) toast(okMsg, 'ok'); else if (r && r.error) toast('Export impossible', 'err'); };
    const data = h('div', { class: 'panel' }, h('h3', null, 'Données'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => exp(api.exportPdf, 'Rapport PDF enregistré') }, icon('file'), 'Exporter en PDF'),
        h('button', { class: 'btn', type: 'button', onclick: () => exp(api.exportCsv, 'Fichier CSV enregistré') }, icon('down'), 'Exporter en CSV (Excel)'),
        h('button', { class: 'btn', type: 'button', onclick: doSync }, icon('sync'), 'Synchroniser maintenant')));

    setContent(content, permBanner(), h('div', { style: { maxWidth: '860px' } }, account, security, appPanel, data,
      h('p', { class: 'muted', style: { textAlign: 'center', marginTop: '18px' } }, 'Fandoa ' + (set.version || S.version) + ' · Raccourcis : Ctrl+N nouveau paiement, Ctrl+F recherche, Ctrl+L verrouiller, F5 synchroniser')));
  }

  function pinDialog(kind) {
    let entry;
    const close = () => closeModal(entry);
    const err = h('div', { class: 'form-error', role: 'alert' });
    const pinInput = (label) => { const i = h('input', { type: 'password', inputmode: 'numeric', maxlength: '6', autocomplete: 'off' }); i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, ''); }); return [i, field(label, i)]; };
    const [cur, curF] = pinInput('Code actuel');
    const [n1, n1F] = pinInput('Nouveau code (4 à 6 chiffres)');
    const [n2, n2F] = pinInput('Confirmer le nouveau code');
    const kids = kind === 'set' ? [n1F, n2F] : kind === 'change' ? [curF, n1F, n2F] : [curF];
    const msgOf = (r) => r.wait ? `Trop d'essais. Réessayez dans ${r.wait} s.` : 'Code actuel incorrect.' + (r.left ? ` (${r.left} essai${r.left > 1 ? 's' : ''} restant${r.left > 1 ? 's' : ''})` : '');
    const form = formShell(kind === 'set' ? 'Créer un code PIN' : kind === 'change' ? 'Modifier le code PIN' : 'Désactiver le code PIN', [err, ...kids], async () => {
      if (kind !== 'clear') {
        if (!/^\d{4,6}$/.test(n1.value)) { err.textContent = 'Le code doit contenir 4 à 6 chiffres.'; return; }
        if (n1.value !== n2.value) { err.textContent = 'Les deux codes ne correspondent pas.'; return; }
      }
      let r;
      if (kind === 'set') r = await api.setPin(n1.value);
      else if (kind === 'change') r = await api.changePin(cur.value, n1.value);
      else r = await api.clearPin(cur.value);
      if (r && r.ok) {
        S.pinEnabled = kind !== 'clear'; close(); toast(kind === 'clear' ? 'Code PIN désactivé' : 'Code PIN enregistré', 'ok'); renderShell();
      } else if (r && (r.wait || r.left !== undefined)) err.textContent = msgOf(r);
      else err.textContent = 'Opération impossible.';
    }, close);
    form.classList.add('sm');
    entry = openModal(form, { sticky: true });
  }

  /* ------------------------------------------------------------ alarme */
  let alarmCtx = null, alarmTimer = null, alarmStop = null;
  function stopBeep() { clearInterval(alarmTimer); clearTimeout(alarmStop); if (alarmCtx) { alarmCtx.close().catch(() => {}); alarmCtx = null; } }
  function startBeep() {
    stopBeep();
    try { alarmCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const beep = () => {
      if (!alarmCtx) return;
      const o = alarmCtx.createOscillator(), g = alarmCtx.createGain(), t = alarmCtx.currentTime;
      o.type = 'sine'; o.frequency.value = 880; g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g); g.connect(alarmCtx.destination); o.start(t); o.stop(t + 0.45);
    };
    beep(); alarmTimer = setInterval(beep, 900); alarmStop = setTimeout(stopBeep, 120000);
  }
  function showAlarm(info) {
    let entry;
    const done = () => { stopBeep(); closeModal(entry); };
    const card = h('div', { class: 'alarm-card' },
      h('div', { class: 'ring' }, icon('alarm')),
      h('h2', null, 'Paiement à effectuer'), h('b', null, info.name), h('div', { class: 'muted' }, info.body),
      h('button', { class: 'btn primary block', type: 'button', onclick: done }, "Arrêter l'alarme"));
    entry = openModal(card, { sticky: true, onClose: stopBeep });
    startBeep();
  }

  /* ------------------------------------------------------------ événements globaux */
  let lastSig = '';
  api.on('data', (d) => {
    const sig = JSON.stringify([d.payments, d.people, d.offline, d.pending, d.error]);
    if (sig === lastSig) return;
    lastSig = sig; applySnapshot(d); onData();
  });
  api.on('auth', async (st) => { Object.assign(S, st); if (S.user && !S.locked) await loadData(); route(); });
  api.on('lock', async (v) => { S.locked = v; if (!v && S.user) await loadData(); route(); });
  api.on('alarm', showAlarm);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modalStack.length) { const top = modalStack[modalStack.length - 1]; closeModal(top); }
      else if (S.drawerId) closeDrawer();
      return;
    }
    if (!S.user || S.locked) return;
    if (e.ctrlKey && (e.key === 'n' || e.key === 'N') && !modalStack.length) { e.preventDefault(); if (S.tab === 'ppl') personForm({}); else { S.tab = 'pay'; renderShell(); paymentForm({}); } }
    else if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); if (S.tab !== 'pay') { S.tab = 'pay'; renderShell(); } const s = $('#search'); if (s) s.focus(); }
    else if (e.ctrlKey && (e.key === 'l' || e.key === 'L') && S.pinEnabled) { e.preventDefault(); api.lock(); }
    else if (e.key === 'F5') { e.preventDefault(); doSync(); }
  });
  let lastAct = 0;
  const activity = () => { const n = Date.now(); if (n - lastAct > 5000) { lastAct = n; api.activity(); } };
  ['mousemove', 'keydown', 'mousedown', 'wheel', 'touchstart'].forEach((ev) => document.addEventListener(ev, activity, { passive: true }));
  window.addEventListener('online', () => api.sync());

  boot();
})();
