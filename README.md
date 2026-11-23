# Fandoa pour Windows

Même fonctions que l'appli Android, mêmes données (Firestore, compte Google).
Electron + installateur NSIS (mise à jour par-dessus l'ancienne version, les données sont conservées).

## Une seule fois : autoriser la connexion Google
1. https://console.cloud.google.com → projet **fandoa-1a628** → *APIs et services* → *Identifiants*.
2. Ouvrir **Web client (auto created by Google Service)**.
3. *URI de redirection autorisés* → ajouter exactement : `http://127.0.0.1:8765/callback` → Enregistrer.
4. Copier le **Code secret du client**.
5. GitHub → dépôt → *Settings → Secrets and variables → Actions → New repository secret* :
   nom `GOOGLE_CLIENT_SECRET`, valeur = le code secret. (Sinon l'appli le demandera au premier lancement.)

## Compiler
Pousser sur GitHub. *Actions → Build installateur Windows → Artifacts → Fandoa-Windows-Setup*.

## Tests locaux
`npm install` puis `npm test`. Lancer : `npm start`.
