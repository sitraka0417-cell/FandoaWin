// Injecte le client secret Google (secret GitHub) dans config.json au moment du build.
const fs = require('fs');
const c = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const s = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
if (s) { c.google.clientSecret = s; fs.writeFileSync('config.json', JSON.stringify(c, null, 2)); console.log('Client secret injecté.'); }
else console.log('Aucun secret fourni : il sera demandé au premier lancement.');
