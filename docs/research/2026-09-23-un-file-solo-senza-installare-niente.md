# Un file `.html` sul disco: cosa si può fare davvero senza installare niente

**Data:** 2026-09-23
**Perché:** il corso semplificato (`/corso-facile/`) deve togliere l'impalcatura — npm, Vite, il
server di sviluppo. La domanda è quanto si riesce ad andare avanti con **un solo file salvato sul
Desktop e aperto con un doppio clic**, che è il punto di partenza più semplice che esista.
**Metodo:** tutto verificato in Chromium headless (Playwright) il 23/09/2026, non dedotto.

## Le tre risposte, in breve

| Domanda | Risposta | Verificato |
|---|---|---|
| Un file `file://` è un "contesto sicuro"? | **Sì** | `window.isSecureContext === true` |
| Da lì si accende la webcam? | **Sì** | `getUserMedia` → 1 traccia video |
| Si carica MediaPipe da una CDN? | **Sì** | import + wasm + modello, tutto OK |
| Si carica MediaPipe da un file **accanto** alla pagina? | **No** | bloccato dalla CORS |

## 1. `file://` è un contesto sicuro, e la webcam funziona

```
{ protocollo: 'file:', isSecureContext: true, mediaDevices: true,
  getUserMedia: true, camera: 'ACCESA, tracce: 1' }
```

Contava saperlo perché `getUserMedia` funziona solo in "contesto sicuro" (HTTPS o localhost), e
l'aspettativa naturale è che un file locale non lo sia. In Chromium lo è.

> Avvertenza onesta: la prova è stata fatta con `--use-fake-ui-for-media-stream`, che concede il
> permesso senza mostrare il pop-up (in headless un pop-up non si potrebbe cliccare). Quello che è
> stato dimostrato è che **il browser non rifiuta a priori** una pagina `file://`: il permesso
> resta una scelta dell'utente, come su un sito. Su Chrome il permesso concesso a un file locale
> non viene ricordato da una volta all'altra, quindi in aula va messo in conto un clic su
> «Consenti» a ogni apertura.

## 2. La libreria si carica da una CDN, il modello anche

Da una pagina `file://`, con `<script type="module">`:

```
{ origin: 'file://', import: 'OK', wasm: 'OK', modello: 'CARICATO', connections: 21 }
```

Cioè: `import` da `cdn.jsdelivr.net`, `FilesetResolver.forVisionTasks(...)` sul wasm della CDN e
`GestureRecognizer.createFromOptions(...)` con il modello preso da `storage.googleapis.com`.
Tutto riuscito. L'origine della pagina è `null`, ma le CDN rispondono con
`Access-Control-Allow-Origin: *` e il browser accetta.

## 3. La libreria **accanto** alla pagina invece NON si carica

Copiando `vision_bundle.mjs` nella stessa cartella e importandolo con `./vision_bundle.mjs`:

```
Access to script at 'file:///…/vision_bundle.mjs' from origin 'null' has been blocked
TypeError: Failed to fetch dynamically imported module
```

I moduli ES sono soggetti alla CORS anche fra due file nella stessa cartella, perché ogni
`file://` ha origine `null`. **Questo chiude la strada "scarica i file una volta e lavora
offline" senza un server.**

## Conseguenza per il corso: c'è un bivio, non tre strade

- **A — un file solo, libreria dalla CDN.** Zero installazioni, dal primo minuto all'ultimo.
  Lo studente salva `mano.html` sul Desktop, doppio clic, la webcam si accende e la mano compare.
  Prezzo: serve la connessione a internet, e il file contatta `cdn.jsdelivr.net` e
  `storage.googleapis.com`. **Le immagini della webcam non escono comunque dal browser**: dalla
  rete arrivano solo la libreria e il modello, il riconoscimento gira in locale come sempre.
- **B — come oggi**: Node, npm, Vite, il server di sviluppo, e tutto dal proprio dominio. È la
  strada del sito pubblicato e del `/corso/` attuale. Nessuna richiesta a terzi, ma è esattamente
  l'impalcatura che rende il corso difficile.

Non esiste una via di mezzo senza server: il punto 3 la esclude.

## Vincoli da rispettare se si sceglie A

- **Versioni fissate anche negli indirizzi** (regola P2): `@mediapipe/tasks-vision@1.0.1`,
  `/wasm` della stessa versione, modello `/float16/1/`. Mai `@latest` in un URL del corso,
  altrimenti a gennaio il corso si rompe da solo.
- **Dirlo agli studenti**, non nasconderlo: il programma scarica due cose da internet, le immagini
  della webcam no. È una differenza che vale la pena spiegare, non un dettaglio da saltare.
- La scelta vale **solo per i file di esercizio degli studenti**. Il sito pubblicato resta com'è:
  niente CDN, tutto dal proprio dominio, CSP che blocca il resto (vedi `deploy/Caddyfile.snippet`).
- Se in aula manca la rete: si torna alla strada B, oppure il docente serve la cartella da un
  server locale.

## Cosa questo cambia rispetto al `/corso/` attuale

Nel corso attuale la webcam arriva alla **lezione 7-8**, dopo una lezione intera (la 6) dedicata a
Node, Vite e ai moduli, perché gli editor online non possono accendere la camera dentro i loro
riquadri (verificato il 19/09, vedi `2026-09-19-ambienti-online-typescript-senza-login.md`).

Con la strada A quella lezione **sparisce** e la webcam può arrivare molto prima: il momento in cui
lo studente vede la propria mano sullo schermo si sposta dalla lezione 8 alla lezione 5-6. È il
singolo cambiamento che rende il corso più facile, molto più delle scorciatoie sul linguaggio.
