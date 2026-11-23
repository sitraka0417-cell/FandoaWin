// Test de fumée du renderer avec un faux DOM minimal (sans navigateur).
const fs = require('fs'); const path = require('path'); const vm = require('vm'); const assert = require('assert');
class Txt { constructor(t) { this.nodeType = 3; this.text = String(t); } }
class El {
  constructor(tag) { this.nodeType = 1; this.tag = tag; this.children = []; this.style = {}; this.listeners = {}; this.attrs = {}; this.className = ''; this.hidden = false;
    this.value = ''; this.checked = false; this.disabled = false; this.scrollTop = 0; this.parent = null; this.textContent = undefined; this.classList = { add: (c) => { this.className += ' ' + c; } }; }
  set innerHTML(v) { this._html = v; } get innerHTML() { return this._html || ''; }
  append(...k) { for (const x of k) { const n = typeof x === 'string' ? new Txt(x) : x; if (n.parent) n.parent = null; n.parent = this; this.children.push(n); } }
  replaceChildren(...k) { this.children = []; this.append(...k); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  setAttribute(k, v) { this.attrs[k] = v; }
  focus() {} select() {}
  text() { return this.children.map((c) => (c.nodeType === 3 ? c.text : c.text())).join('') + (this.textContent || ''); }
  walk(fn) { fn(this); this.children.forEach((c) => c.nodeType === 1 && c.walk(fn)); }
  find(pred) { let r = null; this.walk((n) => { if (!r && pred(n)) r = n; }); return r; }
  findAll(pred) { const r = []; this.walk((n) => { if (pred(n)) r.push(n); }); return r; }
  querySelector(sel) {
    const parts = sel.split(',').map((s) => s.trim());
    return this.find((n) => n !== this && parts.some((p) => {
      if (p.startsWith('#')) return n.attrs.id === p.slice(1);
      const m = p.match(/^([a-z0-9]*)(?:\.([\w-]+))?(?::not\(.*\))?$/i); if (!m) return false;
      return (!m[1] || n.tag === m[1]) && (!m[2] || n.className.split(/\s+/).includes(m[2]));
    }));
  }
  click() { (this.listeners.click || []).forEach((f) => f({ target: this, stopPropagation() {}, preventDefault() {} })); }
  fire(t, ev) { (this.listeners[t] || []).forEach((f) => f(Object.assign({ target: this, preventDefault() {}, stopPropagation() {} }, ev))); }
}
const body = new El('body');
const mk = (id) => { const e = new El('div'); e.attrs.id = id; body.append(e); return e; };
const root = mk('root'), modals = mk('modals'), toasts = mk('toasts');
const docListeners = {};
const document = { createElement: (t) => new El(t), createTextNode: (t) => new Txt(t),
  getElementById: (id) => ({ root, modals, toasts }[id]), querySelector: (s) => body.querySelector(s),
  addEventListener: (t, f) => { (docListeners[t] = docListeners[t] || []).push(f); } };

const M = require('../src/model.js');
const now = Date.now(), D = 86400000;
const startDay = M.startOfDay(now);
let payments = [
  { id: 'p1', name: 'Rakoto', personId: 'a', category: 'Salaire', amount: 300000, reason: 'Novembre', note: 'ok', dueDate: startDay - 2 * D, reminderAt: now + D, alarm: true, notif: false, monthly: true, spawned: false, createdAt: now, tranches: [{ amount: 100000, date: now, note: '' }] },
  { id: 'p2', name: 'Soa', personId: '', category: 'Avance', amount: 50000, reason: '', note: '', dueDate: null, reminderAt: null, alarm: false, notif: false, monthly: false, spawned: false, createdAt: now, tranches: [] },
  { id: 'p3', name: 'Zo', personId: '', category: 'Prime', amount: 80000, reason: 'Fin', note: '', dueDate: startDay + 3 * D, reminderAt: null, alarm: false, notif: false, monthly: false, spawned: false, createdAt: now, tranches: [{ amount: 80000, date: now, note: '' }] }
];
let people = [{ id: 'a', name: 'Rakoto', role: 'Gardien', phone: '034', salary: 300000, createdAt: now }];
const saved = []; const evs = {};
const api = {
  state: async () => ({ user: { uid: 'u', email: 'a@b.c', name: 'Sitraka N', photoUrl: '' }, locked: false, pinEnabled: false, needsSecret: false, version: '1.0.0' }),
  list: async () => ({ payments, people, offline: false, pending: 0, error: '' }), settings: async () => ({ trayOnClose: true, autostart: false, lockMinutes: 5, zoom: 0, version: '1.0.0' }),
  savePayment: async (p) => { saved.push(p); return { ok: true, id: p.id || 'new' }; }, deletePayment: async () => ({ ok: true }), savePerson: async (p) => { saved.push(p); return { ok: true }; },
  deletePerson: async () => ({ ok: true }), sync: async () => ({ payments, people, offline: false, pending: 0, error: '' }), setSetting: async () => ({ ok: true }),
  receiptPdf: async () => ({ ok: true }), copyText: async () => ({ ok: true }), exportCsv: async () => ({ ok: true }), exportPdf: async () => ({ ok: true }),
  setPin: async () => ({ ok: true }), changePin: async () => ({ ok: true }), clearPin: async () => ({ ok: true }), lock: async () => ({ ok: true }), unlock: async () => ({ ok: true }),
  signIn: async () => ({ error: 'TIMEOUT' }), cancelSignIn: async () => ({}), signOut: async () => ({}), setSecret: async () => ({ ok: true }), activity() {},
  on: (ch, cb) => { evs[ch] = cb; return () => {}; }
};
const win = { Model: M, api, addEventListener() {}, AudioContext: function () { this.createOscillator = () => ({ connect() {}, start() {}, stop() {}, frequency: {} }); this.createGain = () => ({ connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }); this.currentTime = 0; this.close = () => Promise.resolve(); } };
const ctx = vm.createContext({ window: win, document, console, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {}, Date, Math, JSON, Object, Number, String, Array, Set, Promise, Intl, Error, Boolean, isFinite: Number.isFinite });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const btn = (container, label) => container.find((n) => n.tag === 'button' && n.text().includes(label));
const mustBtn = (c, l) => { const b = btn(c, l); assert(b, 'bouton introuvable: ' + l); return b; };

(async () => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8'), ctx);
  await sleep(50);
  // 1) paiements
  const cards = root.findAll((n) => n.className.includes('card pay'));
  assert.strictEqual(cards.length, 3, 'trois cartes attendues');
  assert(root.text().includes('Reste à payer'));
  const sidebarTxt = root.text(); assert(sidebarTxt.includes('Paiements') && sidebarTxt.includes('Personnel'));
  // statut de retard sur p1
  assert(cards[0].text().includes('En retard'), 'la carte en retard doit être en premier');
  // 2) tiroir
  cards[0].click(); await sleep(10);
  const host = root.find((n) => n.attrs.id === 'drawerhost');
  assert(host.text().includes('Historique des versements'), 'tiroir de détail');
  assert(host.text().includes('Se répète chaque mois'));
  // 3) modifier -> formulaire -> enregistrer
  mustBtn(host, 'Modifier').click(); await sleep(10);
  assert(modals.children.length === 1, 'formulaire ouvert');
  const form = modals.find((n) => n.tag === 'form');
  const inputs = form.findAll((n) => n.tag === 'input' && (n.attrs.type === 'text'));
  assert.strictEqual(inputs[0].value, 'Rakoto');
  form.fire('submit'); await sleep(20);
  assert.strictEqual(saved.length, 1); assert.strictEqual(saved[0].amount, 300000); assert.strictEqual(saved[0].tranches.length, 1);
  assert.strictEqual(modals.children.length, 0, 'formulaire fermé après enregistrement');
  // 4) nouveau paiement invalide puis valide
  mustBtn(root, 'Nouveau paiement').click(); await sleep(10);
  let f2 = modals.find((n) => n.tag === 'form'); f2.fire('submit'); await sleep(5);
  assert(f2.text().includes('Saisissez un nom'), 'validation du nom');
  const t2 = f2.findAll((n) => n.tag === 'input' && n.attrs.type === 'text');
  t2[0].value = 'Nouveau'; t2[1].value = '120 000,5';
  // mode par tranches
  mustBtn(f2, 'Par tranches').click();
  const paid = f2.findAll((n) => n.tag === 'input' && n.attrs.type === 'text')[3]; paid.value = '20000';
  f2.fire('submit'); await sleep(20);
  const np = saved[saved.length - 1]; assert.strictEqual(np.name, 'Nouveau'); assert.strictEqual(np.amount, 120000.5); assert.strictEqual(M.paidOf(np), 20000);
  // 5) personnel / réglages
  mustBtn(root, 'Personnel').click(); await sleep(10);
  assert(root.text().includes('Gardien') && root.text().includes('Reste dû'));
  mustBtn(root, 'Nouvelle personne').click(); await sleep(10);
  const pf = modals.find((n) => n.tag === 'form'); const pt = pf.findAll((n) => n.tag === 'input' && n.attrs.type === 'text'); pt[0].value = 'Jean'; pt[3].value = '150000';
  pf.fire('submit'); await sleep(20); assert.strictEqual(saved[saved.length - 1].salary, 150000);
  mustBtn(root, 'Réglages').click(); await sleep(10);
  assert(root.text().includes('Code PIN') && root.text().includes('Exporter en PDF') && root.text().includes('Taille'));
  mustBtn(root, 'Créer un code').click(); await sleep(10);
  assert(modals.text().includes('Créer un code PIN')); modals.children[0].remove(); modals.children = [];
  // 6) écran de verrouillage, alarme, connexion
  evs.lock(true); await sleep(20); assert(root.text().includes('Déverrouiller'));
  evs.alarm({ id: 'p1', name: 'Rakoto', body: 'Novembre · reste 200 000 Ar' }); await sleep(10); assert(modals.text().includes("Arrêter l'alarme"));
  evs.auth({ user: null, locked: false, pinEnabled: false, needsSecret: true }); await sleep(20);
  assert(root.text().includes('Continuer avec Google') && root.text().includes('client secret') || root.text().includes('Client secret') || root.text().includes('secret'));
  console.log('UI smoke test OK');
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
