# ml5.js handPose + p5.js per un corso scolastico minimo (2026-10-11)

Fonte: documentazione ufficiale ml5 (repo ml5js/ml5-website-v02-docsify, docs/reference/handpose.md), registro npm.

- Versioni attuali: **ml5 1.4.0**, **p5 2.3.4**. Script: `https://unpkg.com/ml5@1/dist/ml5.js` (da fissare a `@1.4.0` per la scuola).
- Con p5 2.x il modello si carica con `handPose = await ml5.handPose()` dentro `async function setup()` (niente più `preload`).
- `handPose.detectStart(video, callback)`; ogni mano ha `keypoints[21]` con `x, y, name` (stessa numerazione MediaPipe: 4 pollice, 8 indice, 12 medio, 16 anulare, 20 mignolo) e `handedness`.
- Opzioni: `maxHands` (2), `flipped` (false), `runtime` "tfjs" (predefinito) o "mediapipe", `modelType` "full"/"lite".
- Il modello si scarica da server Google (tf.hub) al primo avvio; le immagini restano nel browser.
- Prova fatta: sketch minimo (~25 righe, conta le dita con `punta.y < nocca.y`) in Chromium headless con webcam finta → mani riconosciute, conteggio dita che cambia, nessun errore in console.
- Decisione con Giuseppe: ambiente **online** (niente VS Code), studenti che conoscono solo C/C++.

## Aggiornamento: p5 1.x e 2.x, MkDocs
- Con **p5 2.x** `ml5.handPose(callback)` non restituisce l'oggetto subito (`detectStart is not a function`); va usato il modello passato alla callback. Così lo stesso codice gira su p5 1.11.10 e 2.3.4 (verificato con `corso-scuola/tests/prova-sketch.mjs`).
- Il ritardo dei punti nelle schermate di prova dipende dalla lentezza della macchina (tfjs su CPU emulata): con un fotogramma fermo i punti coincidono con la mano.
- **MkDocs 1.6.1** non ha rilasci da agosto 2024 ed è dichiarato non mantenuto (blog Material, 18/02/2026); **Material 9.7** in manutenzione (fix critici ≥ 12 mesi da novembre 2025); successore **Zensical** (0.0.69, legge `mkdocs.yml`).
- Material inserisce 3 `<script>` incorporati per pagina: incompatibili con `script-src 'self'`.
