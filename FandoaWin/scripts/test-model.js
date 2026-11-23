const M = require('../src/model.js');
const assert = require('assert');
// aller-retour Firestore
const p = M.cleanPayment({ id: 'ab/../c', name: ' Rakoto ', amount: '150000', dueDate: 1790000000000, reminderAt: null,
  alarm: true, tranches: [{ amount: 50000, date: 1780000000000, note: 'x' }] });
assert.strictEqual(p.id, 'abc');
const doc = { name: 'projects/x/databases/(default)/documents/users/u/payments/abc', fields: M.paymentFields(p) };
const q = M.paymentFromDoc(JSON.parse(JSON.stringify(doc)));
assert.deepStrictEqual(q, Object.assign({}, p, { id: 'abc' }));
assert.strictEqual(M.remainingOf(q), 100000);
assert.strictEqual(M.statusOf(q, 1700000000000), 'PARTIAL');
assert.strictEqual(M.statusOf(q, 1800000000000), 'LATE');
// ajustement des tranches
let t = M.adjustPaid([{ amount: 30, date: 1, note: '' }, { amount: 50, date: 2, note: '' }], 40);
assert.deepStrictEqual(t.map((x) => x.amount), [30, 10]);
t = M.adjustPaid([], 100); assert.strictEqual(t.length, 1);
// fin de mois
const jan31 = new Date(2027, 0, 31).getTime();
assert.strictEqual(new Date(M.addMonth(jan31)).getDate(), 28);
assert.strictEqual(M.money(1500000), '1 500 000 Ar');
// personne
const per = M.personFromDoc({ name: 'a/b/c/z', fields: M.personFields(M.cleanPerson({ name: 'Jean', salary: 200000 })) });
assert.strictEqual(per.id, 'z'); assert.strictEqual(per.salary, 200000);
// decodage de ce que l'appli Android écrit (long pour dates, double pour montants)
const android = M.paymentFromDoc({ name: 'x/y', fields: { name: { stringValue: 'A' }, amount: { doubleValue: 1000 }, dueDate: { nullValue: null },
  tranches: { arrayValue: {} }, createdAt: { integerValue: '1779999999999' } } });
assert.strictEqual(android.dueDate, null); assert.strictEqual(android.tranches.length, 0);
console.log('model OK');
