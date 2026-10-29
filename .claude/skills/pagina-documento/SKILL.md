---
name: pagina-documento
description: Builds a long HTML document page for this site (tutorial, course, handbook) - the page skeleton and CSS conventions, the CSP rules it must respect, how to split the writing across sub-agents without hitting output cut-offs, and the headless Chromium check that catches what reading the code does not (mobile overflow, anchors hidden under the sticky bar, console errors, print). Use whenever a new page of prose is added to app/ or an existing one is extended, and for Italian requests like "fai una pagina che spiega", "aggiungi un capitolo al tutorial", "struttura un corso".
---

# Pagina-documento — una pagina lunga di sola prosa

Le pagine `/tutorial/` e `/corso/` sono fatte così. La terza si fa nello stesso modo, e questa
scheda esiste perché la seconda volta si sono ripetuti gli stessi tre errori.

## 1. I tre file, sempre gli stessi

```
app/<nome>/index.html     il documento (niente <script>, niente style="")
app/src/<nome>.css        il suo aspetto, compreso @media print
app/src/<nome>.ts         una riga sola: import "./<nome>.css";
```

E la quarta cosa da non dimenticare: la voce in `rollupOptions.input` di `app/vite.config.ts`,
più il link nella barra `.nav` di **tutte** le altre pagine. `deploy/pubblica.sh` controlla che
ogni pagina attesa esista nella build: se si aggiunge una pagina, si aggiunge anche lì.

## 2. Vincoli che la CSP di produzione impone

Non sono consigli: `deploy/pubblica.sh` fa fallire la pubblicazione.

- niente `<script>` scritto nella pagina, niente attributi `style=""`;
- nessuna risorsa esterna (`src="https://…"`, `<link href="https://…">`). I **collegamenti**
  `<a href="https://…">` alla documentazione sono leciti: la CSP non li riguarda;
- quindi l'interattività si fa in HTML puro: `<details>`/`<summary>` per soluzioni e risposte,
  `<table>` per le griglie. Effetto collaterale gradito: la pagina si stampa e funziona con
  JavaScript disattivato.

## 3. Scriverla in parallelo senza perdere pezzi

Una pagina da 5000 righe non la scrive un solo agente in un solo colpo: la risposta viene
tagliata a metà e riparte da capo, all'infinito.

1. **Scrivi a mano il primo capitolo/lezione per intero.** È il modello: i sub-agenti lo leggono
   e copiano la struttura. Senza modello, tornano cinque stili diversi.
2. Dai a ogni sub-agente **un file per capitolo**, non un file unico:
   `lez2.html`, `lez3.html`… nello scratchpad. Sopra le ~400 righe, due passate (Write della
   prima metà, Edit per la seconda).
3. Chiedi **solo il frammento** (`<section>…</section>`), mai la pagina intera: l'assemblaggio lo
   fa il coordinatore, con un marcatore piazzato prima nel file
   (`<!-- ===== SEZIONI FINALI ===== -->`) come punto di inserimento.
4. Chiedi all'agente di **eseguire** i controlli e riportarne l'esito, non di prometterli: conteggio
   delle sezioni, `grep style="`, somma dei minuti/numeri, annidamento con `html.parser`.
   Se ci sono numeri negli esempi (somme, medie, distanze), falli **calcolare davvero**: due su
   dieci erano sbagliati.
5. Nella risposta finale l'agente elenca i file, **non incolla l'HTML**.

## 4. Verifica: aprirla, non leggerla

R5. Tre cose che il codice non mostra e che sono uscite solo aprendola in Chromium:

- **tabelle che sforano** sotto i 640px → la pagina scorre di lato. Rimedio nel `@media`:
  `table { display: block; overflow-x: auto; }` + `th, td { min-width: 8em; }`;
- **titoli nascosti sotto la barra** `sticky` arrivando da un link dell'indice →
  `[id] { scroll-margin-top: 72px; }`;
- errori in console che nessuno si aspetta da una pagina senza JavaScript (li dà il CSS
  o un'entità sbagliata).

Script di controllo (usa e getta, in `app/tests/e2e/.cache/`, si cancella dopo): server statico
su `dist`, poi per ogni larghezza (1280 e 390) apri la pagina e misura

```js
await page.evaluate(() => ({
  sezioni: document.querySelectorAll(".lezione").length,
  scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
}));
```

più `page.on("pageerror")` e `page.on("console")` per gli errori, una schermata a entrambe le
larghezze **guardata davvero**, e una prova d'ancora (`goto("…#lez8")` e leggi il titolo).

Poi i controlli sul file: annidamento con `html.parser` (attenzione: i tag vuoti `<meta/>`,
`<br/>` vanno saltati anche in `handle_endtag`, altrimenti il verificatore segnala errori che non
esistono) e ancore dell'indice tutte esistenti (`href="#x"` ⊂ `id="x"`).

## 5. Prima di dire fatto

`cd app && npm run test:e2e` (deve finire con `E2E OK`), `deploy/pubblica.sh`, e poi il sito
vero: `curl -s -o /dev/null -w "%{http_code}" -u 123:123 https://mano.giuseppebosi.com/<nome>/`
deve dare 200, e senza credenziali 401. Aggiorna `PROJECT.md`, `docs/COME-FUNZIONA.md` (un
capitolo per pagina) e `docs/JOURNAL.md`.
