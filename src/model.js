(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Model = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STATUS = { UNPAID: 'À payer', PARTIAL: 'Partiel', PAID: 'Payé', LATE: 'En retard' };
  const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

  const money = (n) => nf.format(Number(n) || 0).replace(/[\u202f\u00a0]/g, ' ') + ' Ar';
  const dFmt = (ms) => ms ? new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const dtFmt = (ms) => new Date(ms).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const paidOf = (p) => (p.tranches || []).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const remainingOf = (p) => Math.max(0, (Number(p.amount) || 0) - paidOf(p));
  const isPaid = (p) => p.amount > 0 && paidOf(p) >= p.amount - 0.005;

  function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }

  function addMonth(ms) {
    const d = new Date(ms);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return d.getTime();
  }

  function statusOf(p, now) {
    if (isPaid(p)) return 'PAID';
    if (p.dueDate != null && p.dueDate < startOfDay(now || Date.now())) return 'LATE';
    return paidOf(p) > 0 ? 'PARTIAL' : 'UNPAID';
  }

  function adjustPaid(tr, target) {
    const cur = tr.reduce((s, t) => s + t.amount, 0);
    if (Math.abs(target - cur) < 0.005) return tr.slice();
    if (target > cur) return tr.concat([{ amount: target - cur, date: Date.now(), note: '' }]);
    let excess = cur - target;
    const out = tr.map((t) => Object.assign({}, t));
    while (excess > 0.005 && out.length) {
      const last = out.pop();
      if (last.amount > excess + 0.005) { out.push(Object.assign({}, last, { amount: last.amount - excess })); excess = 0; }
      else excess -= last.amount;
    }
    return out;
  }

  function monthKey(p) {
    const d = new Date(p.dueDate != null ? p.dueDate : p.createdAt);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    const s = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ---------- validation / nettoyage (appelé côté processus principal) ---------- */
  const str = (v, n) => String(v == null ? '' : v).slice(0, n || 500);
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const ts = (v) => (v == null || v === '' || !Number.isFinite(Number(v))) ? null : Math.round(Number(v));
  const safeId = (v) => String(v == null ? '' : v).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);

  function cleanPayment(p) {
    p = p || {};
    return {
      id: safeId(p.id),
      name: str(p.name, 120).trim(),
      personId: safeId(p.personId),
      category: str(p.category, 40) || 'Salaire',
      amount: Math.max(0, num(p.amount)),
      reason: str(p.reason, 200),
      note: str(p.note, 1000),
      dueDate: ts(p.dueDate),
      reminderAt: ts(p.reminderAt),
      alarm: !!p.alarm,
      notif: !!p.notif,
      monthly: !!p.monthly,
      spawned: !!p.spawned,
      createdAt: ts(p.createdAt) || Date.now(),
      tranches: (Array.isArray(p.tranches) ? p.tranches.slice(0, 500) : []).map((t) => ({
        amount: Math.max(0, num(t && t.amount)),
        date: ts(t && t.date) || Date.now(),
        note: str(t && t.note, 200)
      }))
    };
  }
  function cleanPerson(p) {
    p = p || {};
    return {
      id: safeId(p.id),
      name: str(p.name, 120).trim(),
      role: str(p.role, 120),
      phone: str(p.phone, 40),
      salary: Math.max(0, num(p.salary)),
      createdAt: ts(p.createdAt) || Date.now()
    };
  }

  /* ---------- Firestore REST <-> objets (compatible avec l'appli Android) ---------- */
  const S_ = (v) => ({ stringValue: String(v == null ? '' : v) });
  const D_ = (v) => ({ doubleValue: Number(v) || 0 });
  const I_ = (v) => (v == null ? { nullValue: null } : { integerValue: String(Math.round(v)) });
  const B_ = (v) => ({ booleanValue: !!v });

  function paymentFields(p) {
    return {
      name: S_(p.name), personId: S_(p.personId), category: S_(p.category),
      amount: D_(p.amount), reason: S_(p.reason), note: S_(p.note),
      dueDate: I_(p.dueDate), reminderAt: I_(p.reminderAt),
      alarm: B_(p.alarm), notif: B_(p.notif), monthly: B_(p.monthly), spawned: B_(p.spawned),
      createdAt: I_(p.createdAt),
      tranches: { arrayValue: { values: (p.tranches || []).map((t) => ({ mapValue: { fields: { amount: D_(t.amount), date: I_(t.date), note: S_(t.note) } } })) } }
    };
  }
  function personFields(p) {
    return { name: S_(p.name), role: S_(p.role), phone: S_(p.phone), salary: D_(p.salary), createdAt: I_(p.createdAt) };
  }

  function dec(v) {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return !!v.booleanValue;
    if ('timestampValue' in v) return Date.parse(v.timestampValue);
    if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(dec);
    if ('mapValue' in v) return decFields((v.mapValue && v.mapValue.fields) || {});
    return null;
  }
  function decFields(f) { const o = {}; for (const k of Object.keys(f)) o[k] = dec(f[k]); return o; }

  function docId(doc) { return String(doc.name || '').split('/').pop(); }

  function paymentFromDoc(doc) {
    const f = decFields(doc.fields || {});
    return {
      id: docId(doc), name: f.name || '', personId: f.personId || '', category: f.category || 'Salaire',
      amount: num(f.amount), reason: f.reason || '', note: f.note || '',
      dueDate: f.dueDate == null ? null : f.dueDate, reminderAt: f.reminderAt == null ? null : f.reminderAt,
      alarm: !!f.alarm, notif: !!f.notif, monthly: !!f.monthly, spawned: !!f.spawned,
      createdAt: num(f.createdAt),
      tranches: (Array.isArray(f.tranches) ? f.tranches : []).map((t) => ({ amount: num(t.amount), date: num(t.date), note: t.note || '' }))
    };
  }
  function personFromDoc(doc) {
    const f = decFields(doc.fields || {});
    return { id: docId(doc), name: f.name || '', role: f.role || '', phone: f.phone || '', salary: num(f.salary), createdAt: num(f.createdAt) };
  }

  function newId() {
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = require('crypto').randomBytes(20);
    let s = '';
    for (let i = 0; i < 20; i++) s += abc[bytes[i] % abc.length];
    return s;
  }

  return {
    STATUS, money, dFmt, dtFmt, paidOf, remainingOf, isPaid, startOfDay, addMonth, statusOf, adjustPaid,
    monthKey, monthLabel, cleanPayment, cleanPerson, paymentFields, personFields,
    paymentFromDoc, personFromDoc, newId, safeId
  };
});
