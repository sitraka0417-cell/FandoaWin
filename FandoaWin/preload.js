'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const EVENTS = ['data', 'auth', 'lock', 'alarm'];

contextBridge.exposeInMainWorld('api', {
  state: () => invoke('state'),
  signIn: () => invoke('signIn'),
  cancelSignIn: () => invoke('cancelSignIn'),
  signOut: () => invoke('signOut'),
  setSecret: (s) => invoke('setSecret', s),
  unlock: (pin) => invoke('unlock', pin),
  lock: () => invoke('lock'),
  setPin: (pin) => invoke('setPin', pin),
  changePin: (oldPin, newPin) => invoke('changePin', oldPin, newPin),
  clearPin: (pin) => invoke('clearPin', pin),
  list: () => invoke('list'),
  sync: () => invoke('sync'),
  savePayment: (p) => invoke('savePayment', p),
  deletePayment: (id) => invoke('deletePayment', id),
  savePerson: (p) => invoke('savePerson', p),
  deletePerson: (id) => invoke('deletePerson', id),
  settings: () => invoke('getSettings'),
  setSetting: (k, v) => invoke('setSetting', k, v),
  exportCsv: () => invoke('exportCsv'),
  exportPdf: () => invoke('exportPdf'),
  receiptPdf: (id) => invoke('receiptPdf', id),
  copyText: (t) => invoke('copyText', t),
  activity: () => ipcRenderer.send('activity'),
  on: (channel, cb) => {
    if (!EVENTS.includes(channel) || typeof cb !== 'function') return () => {};
    const fn = (_e, ...args) => cb(...args);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  }
});
