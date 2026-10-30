# ml5 handPose: una mano sola e le ossa (30/10/2026)

**Perché:** la lezione 1 del corso per la scuola diventa il «Tutorial» del sito: una mano sola, punti e ossa.

- `ml5.handPose(?options, ?callback)`; opzione `maxHands` (predefinito 2). Con `{ maxHands: 1 }` il
  modello cerca al massimo una mano. Verificato anche nel sorgente di `ml5@1.4.0/dist/ml5.js`
  (default `maxHands: 2`, passato a MediaPipe come `maxNumHands`).
- `handPose.getConnections()` restituisce le coppie di indici dei punti da unire: `[[0,1],[1,2],...]`.
- Fonte: https://github.com/ml5js/ml5-website-v02-docsify/blob/main/docs/reference/handpose.md

## Prova nell'editor vero (editor.p5js.org, p5 2.3.4 predefinito)

- Lo sketch è stato incollato ed eseguito nell'editor online con Chromium headless e webcam finta:
  punti e ossa compaiono, nessun errore (solo un avviso del backend grafico, tipico dell'headless).
- Trovato provando: le righe lunghe di `index.html` vanno a capo da sole. Chi preme Fine su una
  riga «a capo» finisce in mezzo al tag `<script>` di p5.js e la riga di ml5 resta dentro → `ml5 is
  not defined`. Nella lezione: «alla fine della riga, dopo `</script>`» + avviso + riga nella tabella
  «Se non funziona».
- Le schermate dei passi sono vere, catturate così, in italiano e in inglese (l'editor ha la lingua).
- Nell'editor in italiano il pulsante Play non si clicca con Playwright (risulta instabile): si
  avvia con Ctrl+Invio.
