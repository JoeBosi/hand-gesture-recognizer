# Recognizer-Mano

> Il contesto che l'agente legge prima di ogni task. `TBD` = non ancora deciso: non inventarlo.

## Goal
Web app che riconosce in tempo reale i **gesti della mano dalla webcam**, direttamente nel
browser (nessun invio di immagini a un server). Utenti e caso d'uso finale: TBD.

## Current state
**Online dal 2026-09-17 su https://mano.giuseppebosi.com**, pagine mano, sfida, onda, corpo (+ tutorial
e corso, tolti dal menu). Dal 2026-10-05 **accesso libero, senza password**, con al massimo **5 persone
insieme** (schede con la camera accesa, contate da `deploy/server.mjs`; oltre il limite la pagina dice
«al completo» e resta in attesa):
- `/` — mano e dita in 3D stilizzato (fino a 2 mani) con nome del gesto e anteprima con landmark;
- `/corpo/` — corpo intero: **scheletro umano** (cranio orientato da orecchie e naso, colonna,
  gabbia toracica, bacino, ossa lunghe con le teste) costruito sopra i 33 punti di PoseLandmarker
  lite; le **mani vere** (21 punti per mano) arrivano da un secondo modello, `HandLandmarker`, che
  gira sullo stesso fotogramma e viene agganciato al polso del braccio più vicino; parti nascoste
  non disegnate (soglia su `visibility`);
- `/tutorial/` — guida in italiano, senza camera, su come costruire una cosa del genere da zero;
- `/corso/` — programma di un corso di 10 lezioni da 2 ore (TypeScript da zero fino alla mano),
  con esercizi, soluzioni, griglia di valutazione e ambienti online senza login. Solo HTML: la
  pagina non ha JavaScript proprio e si stampa.

## Stack and constraints
- Runtime: browser moderno (Chrome/Edge/Firefox/Safari), JavaScript/TypeScript.
- Riconoscimento: **MediaPipe Tasks Vision** (`@mediapipe/tasks-vision`, 1.0.1 al 2026-09-17),
  task `GestureRecognizer` (8 gesti pronti) o `HandLandmarker` + logica propria.
  Procedura: `.claude/skills/mediapipe-hand-gestures/SKILL.md`.
- UI: **Vite 8 + TypeScript, senza framework** (una sola pagina); 3D con **Three.js 0.186**.
- Hosting: servizio systemd `mano` (`deploy/server.mjs`, Node senza dipendenze) che serve
  **`app/dist` dentro il progetto** su 127.0.0.1:8791; Caddy fa da reverse proxy per
  `mano.giuseppebosi.com` con HTTPS, CSP e Permissions-Policy. Nessun file fuori dalla cartella
  (R3): Caddy gira come utente `caddy` e non può leggere sotto /root, il servizio sì.
- Struttura: `app/src/` — regia `{main,corpo}.ts`, comuni `{camera,filter,scene3d}.ts`,
  riconoscimento `{tracker,pose,hands}.ts`, disegno `{hand3d,body3d}.ts` + forme in `bones.ts`;
  `app/scripts/prepare-assets.mjs` (wasm + i tre modelli nel sito), `app/vite.config.ts`
  (build a quattro pagine + telemetria MediaPipe disattivata), `app/tests/e2e/` (test con webcam
  finte, tre scenari), `app/prova-scheletro.html` (lo scheletro su una posa finta, solo in
  sviluppo: non è nella build), `deploy/` (snippet Caddy, script di pubblicazione).
- Documentazione del codice: `docs/COME-FUNZIONA.md` (22 capitoli) + `docs/diagrammi/*.svg`.
- Costo misurato per fotogramma sulla pagina del corpo, su CPU pura (VPS senza GPU): posa 84 ms,
  mani 131 ms. Se servisse alleggerire, la leva è far girare le mani a fotogrammi alterni.
- Vincoli non negoziabili:
  - elaborazione **solo on-device**: i frame della webcam non lasciano il browser;
  - `getUserMedia` richiede un contesto sicuro: HTTPS oppure `localhost`;
  - versione del pacchetto npm e della cartella `wasm` sempre **allineate e fissate** (mai `@latest` in produzione).
- Gesti da riconoscere oltre a quelli pronti (modello custom con Model Maker?): TBD.

## Safety
- Dati sensibili: **immagini/video di persone** (potenzialmente dati biometrici, GDPR).
  Regole: `.claude/skills/webcam-capture/SKILL.md` e sub-agente `privacy-auditor`.
- Secrets: in `.env`, mai nel repo. I nomi delle variabili vanno in `.env.example`.
- Richiedono sempre conferma esplicita: qualsiasi invio/salvataggio/log di frame o landmark
  fuori dal browser, analytics o SDK di terzi, deploy pubblici, raccolta di dataset con volti
  di altre persone.

## Definition of done
- `npm run build` senza errori e test verdi (quando esistono);
- verifica end-to-end nel browser headless con webcam finta (sub-agente `browser-tester`):
  la pagina carica il modello e mostra un gesto riconosciuto, con screenshot/log reali;
- `privacy-auditor` senza problemi bloccanti;
- riga in `docs/JOURNAL.md`; memoria aggiornata se è emerso un fatto nuovo.

## Documentazione
Spiegazione completa del codice, con diagrammi: `docs/COME-FUNZIONA.md` (+ `docs/diagrammi/*.svg`).

## Useful commands
```bash
cd app && npm run dev       # sviluppo (http://localhost:5173, la camera funziona su localhost)
cd app && npm run build     # build in app/dist
cd app && npm run test:e2e  # test end-to-end (mano + corpo) con webcam finte e CSP di produzione
cd app && SOLO=corpo npm run test:e2e   # solo una pagina
deploy/pubblica.sh          # build + controlli + riavvio del servizio mano
deploy/attiva-caddy.sh      # prima installazione: servizio systemd + blocco Caddy
deploy/aggiorna-caddy.sh    # riallinea il blocco Caddy già installato (intestazioni, CSP, eventuale password)
systemctl status mano       # stato del server statico (porta 8791)
./bootstrap.sh              # ripristina skill e controlla il kit
./bootstrap.sh --check      # solo controllo
npx -y skills@latest ls     # skill installate
```

## Out of scope
- Invio di immagini/video a API cloud di riconoscimento (Google Cloud Vision, OpenAI, ecc.).
- Identificazione di persone (volti), salvataggio di registrazioni.
- Modifiche alla configurazione condivisa del VPS (nginx, systemd, firewall) senza conferma.
