---
name: corso-mkdocs
description: Writes and maintains the school course "La mano al computer" built with MkDocs + Material in corso-scuola/ - lessons for students who only know C/C++, using p5.js + ml5.js handPose in the online p5.js editor. Covers the lesson template (deliverable stated first), the code rules (works on p5 1.x and 2.x, ml5 pinned), the headless test of every sketch with a fake webcam, building the site and the known publishing constraint (CSP vs Material inline scripts). Use for any new lesson, exercise, fix or rebuild of the course, and for Italian requests like "fai la lezione 2", "aggiungi un esercizio", "aggiorna il corso", "mkdocs".
---

# Corso «La mano al computer» (MkDocs, + versioni Quarto e mdBook)

**Tre versioni, una fonte** (dal 11/10/2026, in prova finché Giuseppe non sceglie): si scrive SOLO in
`docs/` nel formato MkDocs; `convertitore/converti.py` produce Quarto e mdBook; `costruisci.sh`
costruisce tutto (`costruisci.sh <dist>` copia in `<dist>/scuola/`), `installa-strumenti.sh`
installa gli strumenti. Elementi nuovi di sintassi MkDocs vanno aggiunti anche al convertitore.
Pubblicate in `/scuola/mkdocs/`, `/scuola/quarto/`, `/scuola/mdbook/` (pagina di scelta in `scelta/`).

Tutto sta in `corso-scuola/`:

```
corso-scuola/
  mkdocs.yml               configurazione (tema Material, nav, estensioni)
  requirements.txt         mkdocs + mkdocs-material, versioni fissate
  docs/index.md            indice del corso: tabella lezioni con «Cosa ottieni alla fine»
  docs/lezioni/NN-*.md     una pagina per lezione
  docs/codice/lezione-NN.js  il programma completo della lezione (incluso nella pagina con --8<--)
  docs/img/lezione-NN-risultato.png  la schermata del risultato
  tests/prova-sketch.mjs   prova di uno sketch con webcam finta, p5 1.x e 2.x
```

Decisioni prese con Giuseppe (non rimetterle in discussione senza motivo):
studenti che sanno solo C/C++; ambiente **online** (editor.p5js.org), niente VS Code, niente
installazioni; librerie p5.js + ml5.js; modello della mano scaricato da Google (non dal nostro
server: banda sprecata); niente Python.

## Regola principale: il risultato prima di tutto

Ogni lezione (e ogni esercizio) **comincia dicendo cosa si vede sullo schermo alla fine**:

1. Box `!!! success "Cosa ottieni alla fine di questa lezione"` come primo elemento, con: una frase
   in grassetto, la schermata vera (`docs/img/lezione-NN-risultato.png`), tempo, righe di codice,
   cosa serve.
2. Poi i tre blocchi, sempre in quest'ordine e con il tempo: **1. Farlo partire** (passi numerati,
   ognuno chiuso da un «Controllo» che dice cosa deve apparire) · **2. Capirlo** (confronto con il C,
   tabelle brevi) · **3. Modificarlo** (esercizi: ognuno comincia con **Risultato:** e ha la
   soluzione in `??? example "Soluzione"`).
3. In fondo: «Se non funziona» (tabella sintomo → cosa fare) e «La prossima lezione» con il suo
   risultato.
4. Aggiornare la riga della lezione in `docs/index.md` (tabella) e `nav` in `mkdocs.yml`.
   Le lezioni non ancora scritte stanno in tabella *senza link*, con «(in preparazione)».

Linguaggio: italiano semplice, frasi corte, ogni concetto nuovo agganciato al C (`main`, `struct`,
puntatori a funzione, `#include`). Un concetto nuovo per volta.

## Regole sul codice delle lezioni

- Deve funzionare con **p5 1.x e 2.x** (l'editor online può avere l'una o l'altra): niente `async
  setup()`, niente `preload()`. Il modello si carica con la callback, e si usa l'oggetto che la
  callback riceve:
  ```javascript
  ml5.handPose(modelloPronto);
  function modelloPronto(modello) { handPose = modello; handPose.detectStart(video, maniTrovate); }
  ```
  (Con p5 2.x `ml5.handPose()` non restituisce subito l'oggetto: `handPose.detectStart is not a
  function`. Trovato e verificato l'11/10/2026.)
- ml5 **fissato**: `https://unpkg.com/ml5@1.4.0/dist/ml5.js`. Prima di cambiare versione: leggere la
  documentazione (skill `web-research`) e rifare la prova su tutte le lezioni.
- Nomi delle variabili in italiano (`mani`, `punto`, `punta`), commenti a fine riga.
- Niente specchio finché una lezione non lo spiega.

## Verificare (obbligatorio prima di dire «fatto»)

1. **Ogni sketch** della lezione (programma e soluzioni degli esercizi, se cambiano il comportamento):
   ```bash
   node corso-scuola/tests/prova-sketch.mjs corso-scuola/docs/codice/lezione-NN.js
   ```
   Deve finire con `SKETCH OK` (mani trovate e nessun errore, su entrambe le versioni di p5). Le
   schermate vanno in `corso-scuola/tests/.cache/`; quella buona si copia in `docs/img/`.
   Usare il **fotogramma fermo** (predefinito): con il video che cambia, sulla macchina lenta di prova
   i punti arrivano in ritardo e la schermata sembra sbagliata anche quando il codice è giusto.
   Per una lezione che riconosce un gesto preciso, passare un video adatto come secondo argomento
   (i video dell'app sono in `app/tests/e2e/.cache/`, costruiti da `app/tests/e2e/make-video.sh`).
2. **Il sito**: `.venv/bin/mkdocs build -s -f corso-scuola/mkdocs.yml` (`-s` = gli avvisi sono
   errori: link rotti, pagine fuori dal nav). Poi guardarlo a 1280 e a 390 px: niente scorrimento
   orizzontale, nessun errore in console.

Ambiente: `python3 -m venv .venv && .venv/bin/pip install -r corso-scuola/requirements.txt`
(`.venv/` e `corso-scuola/site/` sono ignorati).

## Pubblicazione (vedi sotto: risolto con CSP propria per /scuola/*)

Il tema Material mette **3 script incorporati** in ogni pagina (tema chiaro/scuro, `__md_scope`,
schede). La CSP di `mano.giuseppebosi.com` (`script-src 'self'`) li blocca. Prima di pubblicare
sotto `/scuola/` serve una decisione di Giuseppe (tocca Caddy = configurazione condivisa, R7):
scelta l'opzione (a): `deploy/Caddyfile.snippet` dà a `/scuola/*` una CSP con `'unsafe-inline'`
e camera vietata. Restano vietate le risorse esterne: niente temi con Google Fonts (Quarto `cosmo`
li scarica), `font: false` in MkDocs. Controllo nel browser: tutte le pagine delle tre versioni a 1280
e 390 px con quella CSP. Pubblicare: `deploy/pubblica.sh` (+ `aggiorna-caddy.sh` se cambia lo snippet).

## Stato e manutenzione

- MkDocs 1.x non ha più aggiornamenti (da agosto 2024); Material è in sola manutenzione (9.7.x, fix
  critici almeno fino a novembre 2026). Il successore indicato dagli stessi autori è **Zensical**,
  che legge `mkdocs.yml`: quando Material smette di ricevere correzioni, valutare il passaggio (R2,
  nota in `docs/research/`). Fonte: blog di Material for MkDocs, letto l'11/10/2026.
- A ogni modifica di questa skill: annotare cosa è cambiato e perché in `docs/JOURNAL.md`.
