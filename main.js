'use strict';
const {
  app, BrowserWindow, ipcMain, Notification, Tray, Menu, shell, dialog,
  safeStorage, nativeImage, screen, clipboard, powerMonitor, session
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const M = require('./src/model.js');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${cfg.firebase.projectId}/databases/(default)/documents`;
const REDIRECT_PORT = 8765;
const REDIRECT = `http://127.0.0.1:${REDIRECT_PORT}/callback`;
const INDEX_URL = pathToFileURL(path.join(__dirname, 'src', 'index.html')).href;
const ICON = path.join(__dirname, 'assets', 'icon.png');

app.setAppUserModelId('mg.sitraka.fandoa');
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null;
let tray = null;
let quitting = false;
const startHidden = process.argv.includes('--hidden');

/* ------------------------------------------------------------------ stockage */
const P = (f) => path.join(app.getPath('userData'), f);
function readJson(f, def) { try { return JSON.parse(fs.readFileSync(P(f), 'utf8')); } catch (e) { return def; } }
function writeAtomic(f, data) { const tmp = P(f) + '.tmp'; fs.writeFileSync(tmp, data); fs.renameSync(tmp, P(f)); }
function writeJson(f, obj) { writeAtomic(f, JSON.stringify(obj)); }
function readSecure(f, def) {
  try {
    const b = fs.readFileSync(P(f));
    const s = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString('utf8');
    return JSON.parse(s);
  } catch (e) { return def; }
}
function writeSecure(f, obj) {
  const s = JSON.stringify(obj);
  writeAtomic(f, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s) : Buffer.from(s, 'utf8'));
}
function rm(f) { try { fs.unlinkSync(P(f)); } catch (e) { /* ignore */ } }

let settings = {
  trayOnClose: true, autostart: false, lockMinutes: 5, zoom: 0,
  bounds: null, maximized: false, pinSalt: null, pinHash: null, fired: {}
};
const saveSettings = () => { try { writeJson('settings.json', settings); } catch (e) { console.error(e); } };

/* ------------------------------------------------------------------ état */
let session_ = null;           // { refreshToken, uid, email, name, photoUrl }
let idToken = null;
let idExp = 0;
let state = { payments: [], people: [], offline: false, error: '' };
let outbox = [];               // opérations en attente d'envoi
let locked = false;

const publicUser = () => session_ ? { uid: session_.uid, email: session_.email, name: session_.name, photoUrl: session_.photoUrl } : null;
const pinEnabled = () => !!settings.pinHash;
const send = (ch, ...a) => { if (win && !win.isDestroyed()) win.webContents.send(ch, ...a); };
const snapshot = () => ({ payments: state.payments, people: state.people, offline: state.offline, error: state.error, pending: outbox.length });
const emitData = () => { if (!locked) send('data', snapshot()); };
const publicState = () => ({
  user: publicUser(), locked, pinEnabled: pinEnabled(), needsSecret: !cfg.authPage && !getSecret(), version: app.getVersion()
});

function persist() {
  if (!session_) return;
  try { writeSecure('cache.bin', { uid: session_.uid, payments: state.payments, people: state.people, outbox }); } catch (e) { console.error(e); }
}
function loadCache() {
  const c = readSecure('cache.bin', null);
  if (c && session_ && c.uid === session_.uid) {
    state.payments = c.payments || []; state.people = c.people || []; outbox = c.outbox || [];
  } else { state.payments = []; state.people = []; outbox = []; }
}

/* ------------------------------------------------------------------ réseau */
async function jfetch(url, opts) {
  const r = await fetch(url, Object.assign({}, opts, { signal: AbortSignal.timeout(20000) }));
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { /* non JSON */ }
  if (!r.ok) {
    const msg = data && data.error && (data.error.message || data.error_description || data.error);
    const err = new Error(typeof msg === 'string' ? msg : 'HTTP ' + r.status);
    err.status = r.status; err.data = data;
    throw err;
  }
  return data;
}

function getSecret() {
  const c = cfg.google.clientSecret;
  if (c && !/^(|A_REMPLIR)$/.test(c)) return c;
  const s = readSecure('secret.bin', null);
  return s && s.clientSecret ? s.clientSecret : '';
}

async function token() {
  if (idToken && Date.now() < idExp - 60000) return idToken;
  if (!session_) throw new Error('AUTH');
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session_.refreshToken });
  const d = await jfetch(`https://securetoken.googleapis.com/v1/token?key=${cfg.firebase.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  idToken = d.id_token;
  idExp = Date.now() + Number(d.expires_in) * 1000;
  if (d.refresh_token && d.refresh_token !== session_.refreshToken) {
    session_.refreshToken = d.refresh_token;
    writeSecure('session.bin', session_);
  }
  return idToken;
}

async function fsCall(method, p, body, qs) {
  const t = await token();
  return jfetch(`${FS_BASE}/${p}${qs ? '?' + qs : ''}`, {
    method,
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
}

async function listAll(col) {
  const docs = [];
  let pageToken = '';
  do {
    const d = await fsCall('GET', `users/${session_.uid}/${col}`, null,
      'pageSize=300' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
    (d && d.documents || []).forEach((x) => docs.push(x));
    pageToken = d && d.nextPageToken || '';
  } while (pageToken);
  return docs;
}

/* ------------------------------------------------------------------ synchronisation */
let syncing = false;
let syncAgain = false;

async function flushOutbox() {
  while (outbox.length) {
    const op = outbox[0];
    try {
      if (op.op === 'set') await fsCall('PATCH', `users/${session_.uid}/${op.col}/${op.id}`, { fields: op.fields });
      else await fsCall('DELETE', `users/${session_.uid}/${op.col}/${op.id}`);
    } catch (e) {
      const retry = !e.status || e.status >= 500 || e.status === 401 || e.status === 403 || e.status === 429;
      if (retry) throw e;
      console.error('Opération abandonnée', op.col, op.id, e.message);
    }
    outbox.shift();
    persist();
  }
}

async function sync() {
  if (!session_) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  try {
    await flushOutbox();
    const [pd, pp] = await Promise.all([listAll('payments'), listAll('people')]);
    state.payments = pd.map(M.paymentFromDoc);
    state.people = pp.map(M.personFromDoc);
    state.offline = false;
    state.error = '';
    persist();
  } catch (e) {
    if (e.status === 400 && /TOKEN|REFRESH|USER_|CREDENTIAL/.test(String(e.message))) { signOutLocal(); return; }
    if (e.status === 401 || e.status === 403) { state.error = 'PERMISSION'; state.offline = false; }
    else if (!e.status || e.status >= 500) { state.offline = true; }
    console.error('sync:', e.message);
  } finally {
    syncing = false;
    emitData();
    checkReminders();
    if (syncAgain) { syncAgain = false; setTimeout(sync, 300); }
  }
}

function queueSet(col, obj) {
  const list = col === 'payments' ? state.payments : state.people;
  const i = list.findIndex((x) => x.id === obj.id);
  if (i >= 0) list[i] = obj; else list.push(obj);
  outbox = outbox.filter((o) => !(o.col === col && o.id === obj.id));
  outbox.push({ op: 'set', col, id: obj.id, fields: col === 'payments' ? M.paymentFields(obj) : M.personFields(obj) });
}
function queueDel(col, id) {
  if (col === 'payments') state.payments = state.payments.filter((x) => x.id !== id);
  else state.people = state.people.filter((x) => x.id !== id);
  outbox = outbox.filter((o) => !(o.col === col && o.id === id));
  outbox.push({ op: 'del', col, id });
}
function afterWrite() { persist(); emitData(); sync(); }

function signOutLocal() {
  session_ = null; idToken = null; idExp = 0; locked = false;
  state = { payments: [], people: [], offline: false, error: '' };
  outbox = [];
  rm('session.bin'); rm('cache.bin');
  send('auth', publicState());
}

/* ------------------------------------------------------------------ connexion Google (boucle locale + PKCE) */
let loginCtl = null;
const b64u = (buf) => Buffer.from(buf).toString('base64url');

function resultPage(ok) {
  const t = ok ? 'Connexion réussie' : 'Connexion refusée';
  const m = ok ? 'Vous pouvez fermer cet onglet et revenir à Fandoa.' : 'Retournez dans Fandoa et réessayez.';
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Fandoa</title>
<body style="font-family:Segoe UI,Arial,sans-serif;background:#0b4f4a;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="text-align:center;padding:32px"><h1 style="margin:0 0 8px">${t}</h1><p style="opacity:.85">${m}</p></div></body></html>`;
}

async function googleLogin() {
  const usePage = !!cfg.authPage;
  const secret = usePage ? '' : getSecret();
  if (!usePage && !secret) return { error: 'NEED_SECRET' };
  if (loginCtl) return { error: 'BUSY' };
  const verifier = b64u(crypto.randomBytes(48));
  const challenge = b64u(crypto.createHash('sha256').update(verifier).digest());
  const st = b64u(crypto.randomBytes(16));
  const field = usePage ? 'id_token' : 'code';
  const url = usePage
    ? `${cfg.authPage}${cfg.authPage.includes('?') ? '&' : '?'}port=${REDIRECT_PORT}&state=${st}`
    : 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: cfg.google.clientId, redirect_uri: REDIRECT, response_type: 'code',
      scope: 'openid email profile', code_challenge: challenge, code_challenge_method: 'S256',
      state: st, prompt: 'select_account'
    });
  let value;
  try {
    value = await new Promise((resolve, reject) => {
      let finished = false;
      const srv = http.createServer((req, res) => {
        const u = new URL(req.url, `http://127.0.0.1:${REDIRECT_PORT}`);
        if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
        const v = u.searchParams.get(field);
        const good = u.searchParams.get('state') === st && !!v && !u.searchParams.get('error');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(resultPage(good));
        finish(good ? null : new Error(u.searchParams.get('error') === 'access_denied' ? 'DENIED' : 'ERROR'), v);
      });
      const timer = setTimeout(() => finish(new Error('TIMEOUT')), 180000);
      function finish(err, v) {
        if (finished) return;
        finished = true; clearTimeout(timer);
        try { srv.close(); } catch (e) { /* ignore */ }
        if (err) reject(err); else resolve(v);
      }
      loginCtl = { cancel: () => finish(new Error('CANCELED')) };
      srv.on('error', () => finish(new Error('PORT_BUSY')));
      srv.listen(REDIRECT_PORT, '127.0.0.1', () => shell.openExternal(url));
    });
  } catch (e) {
    loginCtl = null;
    return { error: ['CANCELED', 'TIMEOUT', 'PORT_BUSY', 'DENIED'].includes(e.message) ? e.message : 'ERROR' };
  }
  loginCtl = null;

  try {
    let googleIdToken = value;
    if (!usePage) {
      const tok = await jfetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: value, client_id: cfg.google.clientId, client_secret: secret,
          redirect_uri: REDIRECT, grant_type: 'authorization_code', code_verifier: verifier
        })
      });
      googleIdToken = tok.id_token;
    }
    const fb = await jfetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${cfg.firebase.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody: `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`,
        requestUri: 'http://localhost', returnIdpCredential: true, returnSecureToken: true
      })
    });
    session_ = {
      refreshToken: fb.refreshToken, uid: fb.localId, email: fb.email || '',
      name: fb.displayName || fb.fullName || '', photoUrl: fb.photoUrl || ''
    };
    idToken = fb.idToken; idExp = Date.now() + Number(fb.expiresIn || 3600) * 1000;
    writeSecure('session.bin', session_);
    locked = false;
    loadCache();
    send('auth', publicState());
    sync();
    return { ok: true };
  } catch (e) {
    console.error('login:', e.message);
    if (!e.status) return { error: 'NETWORK' };
    const code2 = e.data && e.data.error;
    if (code2 === 'invalid_client') return { error: 'BAD_SECRET' };
    return { error: 'ERROR', message: e.message };
  }
}

/* ------------------------------------------------------------------ code PIN */
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
const validPin = (p) => /^\d{4,6}$/.test(String(p));
function checkPin(pin) {
  if (!settings.pinHash || !validPin(pin)) return false;
  const a = Buffer.from(hashPin(pin, settings.pinSalt), 'hex');
  const b = Buffer.from(settings.pinHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
let fails = 0;
let blockedUntil = 0;
function verifyPin(pin) {
  const now = Date.now();
  if (now < blockedUntil) return { ok: false, wait: Math.ceil((blockedUntil - now) / 1000) };
  if (checkPin(pin)) { fails = 0; return { ok: true }; }
  fails++;
  if (fails >= 5) {
    const wait = Math.min(300, 15 * Math.pow(2, fails - 5));
    blockedUntil = now + wait * 1000;
    return { ok: false, wait };
  }
  return { ok: false, left: 5 - fails };
}
function setPinValue(pin) {
  settings.pinSalt = crypto.randomBytes(16).toString('hex');
  settings.pinHash = hashPin(pin, settings.pinSalt);
  saveSettings();
}

let lockTimer = null;
function armLock() {
  clearTimeout(lockTimer);
  if (pinEnabled() && session_ && !locked && settings.lockMinutes > 0) {
    lockTimer = setTimeout(lockNow, settings.lockMinutes * 60000);
  }
}
function lockNow() {
  if (!pinEnabled() || !session_ || locked) return;
  locked = true;
  clearTimeout(lockTimer);
  send('lock', true);
}

/* ------------------------------------------------------------------ rappels */
function fireReminder(p) {
  const body = `${p.reason || p.category} · reste ${M.money(M.remainingOf(p))}`;
  try {
    const n = new Notification({
      title: 'Paiement à effectuer : ' + p.name, body,
      urgency: p.alarm ? 'critical' : 'normal', timeoutType: p.alarm ? 'never' : 'default'
    });
    n.on('click', showWindow);
    n.show();
  } catch (e) { console.error(e); }
  if (p.alarm) {
    showWindow();
    if (win) win.flashFrame(true);
    send('alarm', { id: p.id, name: p.name, body });
  }
}
function checkReminders() {
  if (!session_) return;
  const now = Date.now();
  let changed = false;
  for (const p of state.payments) {
    if (!(p.alarm || p.notif) || !p.reminderAt || M.remainingOf(p) <= 0) continue;
    if (p.reminderAt > now || p.reminderAt < now - 86400000) continue;
    const key = p.id + ':' + p.reminderAt;
    if (settings.fired[key]) continue;
    settings.fired[key] = now; changed = true;
    fireReminder(p);
  }
  for (const k of Object.keys(settings.fired)) {
    if (settings.fired[k] < now - 30 * 86400000) { delete settings.fired[k]; changed = true; }
  }
  if (changed) saveSettings();
}

/* ------------------------------------------------------------------ exports */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function csvText(list) {
  const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const rows = ['Nom;Catégorie;Motif;Montant;Payé;Reste;Statut;Échéance;Note'];
  for (const p of list) {
    rows.push([q(p.name), q(p.category), q(p.reason), p.amount, M.paidOf(p), M.remainingOf(p),
      q(M.STATUS[M.statusOf(p)]), q(M.dFmt(p.dueDate)), q(p.note)].join(';'));
  }
  return '\uFEFF' + rows.join('\r\n') + '\r\n';
}

const PDF_CSS = `body{font-family:'Segoe UI',Arial,sans-serif;color:#12201f;margin:0;font-size:11pt}
h1{color:#0f766e;margin:0 0 4px;font-size:20pt}.muted{color:#5b6b6a}
table{width:100%;border-collapse:collapse;margin-top:14px}th{background:#0f766e;color:#fff;text-align:left;padding:7px 8px;font-size:10pt}
td{padding:7px 8px;border-bottom:1px solid #dbe5e4;font-size:10pt;vertical-align:top}td.n,th.n{text-align:right;white-space:nowrap}
.kpi{display:flex;gap:12px;margin-top:12px}.kpi div{flex:1;background:#eef6f5;border-radius:10px;padding:10px}
.kpi b{display:block;font-size:13pt;margin-top:2px}.late{color:#dc2626;font-weight:600}.ok{color:#16a34a;font-weight:600}`;

function reportHtml(list) {
  const total = list.reduce((s, p) => s + p.amount, 0);
  const paid = list.reduce((s, p) => s + M.paidOf(p), 0);
  const rows = list.map((p) => {
    const st = M.statusOf(p);
    return `<tr><td><b>${esc(p.name)}</b><br><span class="muted">${esc([p.category, p.reason].filter(Boolean).join(' · '))}</span></td>
<td class="n">${esc(M.money(p.amount))}</td><td class="n">${esc(M.money(M.paidOf(p)))}</td><td class="n">${esc(M.money(M.remainingOf(p)))}</td>
<td class="${st === 'LATE' ? 'late' : st === 'PAID' ? 'ok' : ''}">${esc(M.STATUS[st])}</td><td>${esc(M.dFmt(p.dueDate))}</td></tr>`;
  }).join('');
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${PDF_CSS}</style><body>
<h1>Fandoa · Rapport des paiements</h1><div class="muted">Édité le ${esc(M.dFmt(Date.now()))}</div>
<div class="kpi"><div>Total<b>${esc(M.money(total))}</b></div><div>Payé<b>${esc(M.money(paid))}</b></div><div>Reste à payer<b>${esc(M.money(total - paid))}</b></div></div>
<table><thead><tr><th>Bénéficiaire</th><th class="n">Montant</th><th class="n">Payé</th><th class="n">Reste</th><th>Statut</th><th>Échéance</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

function receiptHtml(p) {
  const tr = p.tranches.map((t) => `<tr><td>${esc(M.dFmt(t.date))}</td><td>${esc(t.note)}</td><td class="n">${esc(M.money(t.amount))}</td></tr>`).join('');
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${PDF_CSS}</style><body>
<h1>Reçu de paiement</h1><div class="muted">Fandoa · ${esc(M.dFmt(Date.now()))}</div>
<p style="margin-top:18px"><b>Bénéficiaire :</b> ${esc(p.name)}<br><b>Catégorie :</b> ${esc(p.category)}${p.reason ? '<br><b>Motif :</b> ' + esc(p.reason) : ''}</p>
<div class="kpi"><div>Montant dû<b>${esc(M.money(p.amount))}</b></div><div>Déjà payé<b>${esc(M.money(M.paidOf(p)))}</b></div><div>Reste à payer<b>${esc(M.money(M.remainingOf(p)))}</b></div></div>
${tr ? `<table><thead><tr><th>Date</th><th>Note</th><th class="n">Montant versé</th></tr></thead><tbody>${tr}</tbody></table>` : ''}
<p style="margin-top:18px"><b>Statut :</b> ${esc(M.STATUS[M.statusOf(p)])}</p></body></html>`;
}

async function htmlToPdf(html) {
  const tmp = path.join(os.tmpdir(), 'fandoa-' + crypto.randomBytes(6).toString('hex') + '.html');
  fs.writeFileSync(tmp, html, 'utf8');
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false, contextIsolation: true } });
  try {
    await w.loadFile(tmp);
    return await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'default' } });
  } finally {
    w.destroy();
    try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
  }
}

async function saveBuffer(buf, defaultName, filters) {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), defaultName), filters });
  if (r.canceled || !r.filePath) return { canceled: true };
  fs.writeFileSync(r.filePath, buf);
  return { ok: true, path: r.filePath };
}

/* ------------------------------------------------------------------ fenêtre */
function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function boundsVisible(b) {
  if (!b) return false;
  const wa = screen.getDisplayMatching(b).workArea;
  return b.x < wa.x + wa.width - 80 && b.x + b.width > wa.x + 80 && b.y < wa.y + wa.height - 60 && b.y >= wa.y - 20;
}

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  let b = { width: Math.min(1320, Math.round(wa.width * 0.9)), height: Math.min(860, Math.round(wa.height * 0.9)) };
  if (settings.bounds && boundsVisible(settings.bounds)) b = settings.bounds;
  win = new BrowserWindow(Object.assign({}, b, {
    minWidth: 900, minHeight: 620, show: false, title: 'Fandoa', icon: ICON,
    backgroundColor: '#0e1514', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false,
      devTools: !app.isPackaged, autoplayPolicy: 'no-user-gesture-required'
    }
  }));
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.webContents.on('did-finish-load', () => win.webContents.setZoomLevel(settings.zoom || 0));
  win.once('ready-to-show', () => {
    if (settings.maximized) win.maximize();
    if (!startHidden) win.show();
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta)) return;
    const k = input.key;
    let z = null;
    if (k === '+' || k === '=' || k === 'Add') z = Math.min(4, (settings.zoom || 0) + 0.5);
    else if (k === '-' || k === 'Subtract') z = Math.max(-3, (settings.zoom || 0) - 0.5);
    else if (k === '0') z = 0;
    if (z !== null) { e.preventDefault(); settings.zoom = z; win.webContents.setZoomLevel(z); saveSettings(); }
  });

  let boundsTimer = null;
  const saveBounds = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      settings.maximized = win.isMaximized();
      if (!win.isMaximized() && !win.isMinimized()) settings.bounds = win.getBounds();
      saveSettings();
    }, 600);
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('hide', () => lockNow());
  win.on('minimize', () => { if (settings.lockMinutes > 0) lockNow(); });
  win.on('focus', () => { win.flashFrame(false); sync(); });
  win.on('close', (e) => {
    if (!quitting && settings.trayOnClose && tray) { e.preventDefault(); win.hide(); }
  });
  win.on('closed', () => { win = null; });
}

function createTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
    tray.setToolTip('Fandoa');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Ouvrir Fandoa', click: showWindow },
      { label: 'Synchroniser', click: () => sync() },
      { type: 'separator' },
      { label: 'Quitter', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', showWindow);
  } catch (e) { console.error(e); }
}

/* ------------------------------------------------------------------ IPC */
const trusted = (e) => !!(e.senderFrame && e.senderFrame.url && e.senderFrame.url.startsWith(INDEX_URL));
function handle(channel, fn) {
  ipcMain.handle(channel, async (e, ...args) => {
    try {
      if (!trusted(e)) return { error: 'FORBIDDEN' };
      return await fn(...args);
    } catch (err) {
      console.error(channel, err);
      return { error: 'ERROR', message: String(err && err.message || err) };
    }
  });
}
const LOCKED = { error: 'LOCKED' };

handle('state', () => publicState());
handle('signIn', () => googleLogin());
handle('cancelSignIn', () => { if (loginCtl) loginCtl.cancel(); return { ok: true }; });
handle('signOut', () => { signOutLocal(); return { ok: true }; });
handle('setSecret', (s) => {
  const v = String(s || '').trim();
  if (v.length < 10 || v.length > 200 || /\s/.test(v)) return { error: 'INVALID' };
  writeSecure('secret.bin', { clientSecret: v });
  return { ok: true };
});

handle('unlock', (pin) => {
  if (!locked) return { ok: true };
  const r = verifyPin(pin);
  if (r.ok) { locked = false; armLock(); send('lock', false); }
  return r;
});
handle('lock', () => { lockNow(); return { ok: true }; });
handle('setPin', (pin) => {
  if (pinEnabled() || !validPin(pin)) return { error: 'INVALID' };
  setPinValue(pin); armLock();
  return { ok: true };
});
handle('changePin', (oldPin, newPin) => {
  if (locked) return LOCKED;
  const r = verifyPin(oldPin);
  if (!r.ok) return r;
  if (!validPin(newPin)) return { error: 'INVALID' };
  setPinValue(newPin);
  return { ok: true };
});
handle('clearPin', (pin) => {
  if (locked) return LOCKED;
  const r = verifyPin(pin);
  if (!r.ok) return r;
  settings.pinHash = null; settings.pinSalt = null; saveSettings(); clearTimeout(lockTimer);
  return { ok: true };
});

handle('list', () => (locked ? LOCKED : snapshot()));
handle('sync', async () => { if (locked) return LOCKED; await sync(); return snapshot(); });

handle('savePayment', (raw) => {
  if (locked) return LOCKED;
  const p = M.cleanPayment(raw);
  if (!p.name || !(p.amount > 0)) return { error: 'INVALID' };
  if (!p.id) p.id = M.newId();
  if (p.monthly && !p.spawned && M.isPaid(p)) {
    queueSet('payments', Object.assign({}, p, {
      id: M.newId(), tranches: [], spawned: false,
      dueDate: p.dueDate != null ? M.addMonth(p.dueDate) : null,
      reminderAt: p.reminderAt != null ? M.addMonth(p.reminderAt) : null,
      createdAt: Date.now()
    }));
    p.spawned = true;
  }
  queueSet('payments', p);
  afterWrite();
  return { ok: true, id: p.id };
});
handle('deletePayment', (id) => {
  if (locked) return LOCKED;
  const sid = M.safeId(id);
  if (!sid) return { error: 'INVALID' };
  queueDel('payments', sid); afterWrite();
  return { ok: true };
});
handle('savePerson', (raw) => {
  if (locked) return LOCKED;
  const p = M.cleanPerson(raw);
  if (!p.name) return { error: 'INVALID' };
  if (!p.id) p.id = M.newId();
  queueSet('people', p); afterWrite();
  return { ok: true, id: p.id };
});
handle('deletePerson', (id) => {
  if (locked) return LOCKED;
  const sid = M.safeId(id);
  if (!sid) return { error: 'INVALID' };
  queueDel('people', sid); afterWrite();
  return { ok: true };
});

handle('getSettings', () => ({
  trayOnClose: settings.trayOnClose, autostart: settings.autostart, lockMinutes: settings.lockMinutes,
  zoom: settings.zoom || 0, version: app.getVersion(), packaged: app.isPackaged
}));
handle('setSetting', (key, value) => {
  if (key === 'trayOnClose') settings.trayOnClose = !!value;
  else if (key === 'autostart') {
    settings.autostart = !!value;
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!value, args: ['--hidden'] });
  } else if (key === 'lockMinutes') {
    if (![0, 1, 5, 15, 30].includes(Number(value))) return { error: 'INVALID' };
    settings.lockMinutes = Number(value); armLock();
  } else if (key === 'zoom') {
    const z = Math.max(-3, Math.min(4, Number(value) || 0));
    settings.zoom = z; if (win) win.webContents.setZoomLevel(z);
  } else return { error: 'INVALID' };
  saveSettings();
  return { ok: true };
});

handle('exportCsv', () => {
  if (locked) return LOCKED;
  return saveBuffer(Buffer.from(csvText(state.payments), 'utf8'), 'fandoa-paiements.csv', [{ name: 'CSV', extensions: ['csv'] }]);
});
handle('exportPdf', async () => {
  if (locked) return LOCKED;
  const pdf = await htmlToPdf(reportHtml(state.payments));
  return saveBuffer(pdf, 'fandoa-rapport.pdf', [{ name: 'PDF', extensions: ['pdf'] }]);
});
handle('receiptPdf', async (id) => {
  if (locked) return LOCKED;
  const p = state.payments.find((x) => x.id === M.safeId(id));
  if (!p) return { error: 'NOT_FOUND' };
  const pdf = await htmlToPdf(receiptHtml(p));
  return saveBuffer(pdf, 'recu-' + p.name.replace(/[^\w-]+/g, '_').slice(0, 30) + '.pdf', [{ name: 'PDF', extensions: ['pdf'] }]);
});
handle('copyText', (t) => { clipboard.writeText(String(t || '').slice(0, 5000)); return { ok: true }; });
ipcMain.on('activity', (e) => { if (trusted(e) && !locked) armLock(); });

/* ------------------------------------------------------------------ démarrage */
app.on('second-instance', () => showWindow());
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (quitting || !settings.trayOnClose) app.quit(); });

app.whenReady().then(() => {
  settings = Object.assign(settings, readJson('settings.json', {}));
  if (!settings.fired) settings.fired = {};
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(false));
  app.on('web-contents-created', (_e, c) => c.on('will-attach-webview', (ev) => ev.preventDefault()));

  session_ = readSecure('session.bin', null);
  if (session_) { loadCache(); locked = pinEnabled(); }
  createWindow();
  createTray();

  setInterval(() => sync(), 20000);
  setInterval(checkReminders, 15000);
  if (session_) setTimeout(sync, 800);
  powerMonitor.on('resume', () => sync());
  powerMonitor.on('lock-screen', () => lockNow());
  powerMonitor.on('suspend', () => lockNow());
  app.on('activate', showWindow);
});
