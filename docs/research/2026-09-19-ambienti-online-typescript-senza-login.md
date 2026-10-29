# Ambienti online per scrivere TypeScript senza registrazione — verifica

**Data:** 2026-09-19
**Perché:** il corso della pagina `/corso/` prevede che le prime lezioni si facciano senza
installare niente, su ambienti aperti a tutti. In aula, «serve un account» significa mezz'ora persa
e qualche studente che resta fuori: andava verificato, non supposto.

## Metodo

Non una ricerca di opinioni: ogni indirizzo è stato **aperto davvero** in un Chromium headless
pulito (nessun cookie, nessuna sessione), con Playwright, aspettando il caricamento e poi
controllando tre cose — codice HTTP, presenza di un editor di testo nel DOM (Monaco, CodeMirror o
Ace), comparsa di un muro di login. Di ognuno è stata salvata una schermata, guardata a occhio.

Lo script era temporaneo (Playwright + un ciclo sui sei indirizzi) ed è stato cancellato dopo la
verifica; le schermate sono state guardate e poi buttate. Per ripetere la prova bastano venti
righe con `chromium.launch()` e `page.goto()`.

## Risultati

| Ambiente | HTTP | Editor | Login richiesto | Esito |
|---|---|---|---|---|
| `typescriptlang.org/play` | 200 | sì (Monaco) | no | **adottato**, lezioni 1-4 |
| `vite.new/vanilla-ts` → StackBlitz | 200 | sì | no | **adottato**, lezioni 5-6 |
| `jsfiddle.net` | 200 | sì (CodeMirror) | no | **adottato**, prove rapide |
| `playcode.io/typescript` | 200 | pagina di presentazione con editor sotto | no, ma spinge molto all'iscrizione | alternativa, non consigliata in aula |
| `mycompiler.io/online-typescript-compiler` | 200 | non rilevato dai selettori usati | non verificato | scartato: non verificato a fondo |
| `codepen.io/pen/` | **403** | — | — | **scartato**: senza account nega l'accesso |

Dettaglio su `vite.new/vanilla-ts`, che è la scoperta più utile: l'indirizzo apre in StackBlitz il
modello ufficiale `create-vite` in versione vanilla + TypeScript, fa `npm install && npm run dev`
da solo e mostra l'anteprima. Nella schermata salvata si vedono il terminale con `added 18 packages
in 4s` e i file `index.html`, `tsconfig.json`, `src/`. È lo **stesso identico progetto** che gli
studenti creeranno in locale nella lezione 6: il passaggio dal browser al computer non cambia nulla
di ciò che vedono.

## Il limite da conoscere: webcam e riquadri incorporati

Gli ambienti online mostrano il risultato dentro un `<iframe>` che arriva da un altro dominio. I
browser, per impostazione predefinita, **negano camera e microfono ai riquadri incorporati
cross-origin** (la Permissions Policy ereditata non concede `camera` senza un `allow="camera"`
esplicito sull'iframe). Conseguenza pratica per il corso: dalla lezione 7 in poi — quella in cui si
accende la webcam — l'anteprima va aperta **in una scheda separata**, oppure si lavora in locale.

Fonte del comportamento: documentazione MDN di `getUserMedia` (contesti sicuri e politiche dei
frame) e la Permissions Policy; confermato dal fatto che il sito di questo progetto deve dichiarare
`Permissions-Policy: camera=(self)` per funzionare.

## Conseguenze sul corso

1. Lezioni 1-4 sul Playground ufficiale: niente installazioni, e il codice viaggia dentro il link
   (il docente distribuisce gli esercizi incollando un indirizzo, gli studenti consegnano allo
   stesso modo).
2. Lezione 5 su `vite.new/vanilla-ts`: primo contatto con un progetto vero, ma ancora nel browser.
3. Lezione 6: installazione locale, con `vite.new` come piano B per chi non ha i permessi sul
   proprio portatile.
4. Dalla 7 in poi serve il locale (o l'anteprima in scheda separata) per via della webcam.
