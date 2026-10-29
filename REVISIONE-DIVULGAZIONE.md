# Revisione per la divulgazione — mano.giuseppebosi.com

Data: 28/10/2026. Richiesta dal Controller per conto di Giuseppe: il sito entra nella home page come progetto
divulgativo, resta aperto, e segue gli stessi standard dei corsi llama.cpp, JSON e API, Claude.

## Pagine coinvolte

App: `/`, `/sfida/`, `/onda/`, `/corpo/`. Documenti: `/tutorial/`, `/corso/`. Corso per la scuola: `/scuola/`
(pagina di scelta) e le tre versioni `/scuola/mkdocs/`, `/scuola/quarto/`, `/scuola/mdbook/`.
Nuove: `/crediti/`, `/privacy/`.

## Cosa cambia, punto per punto

1. **Ogni frase insegna.**
   - In `/corso/` il riquadro «Verificato il 19 settembre 2026» diventa contenuto normale: quali ambienti
     online funzionano senza account e perché CodePen non è adatto.
   - Nel piè di pagina di `/tutorial/` c'era un rimando a un file interno del progetto (`docs/COME-FUNZIONA.md`),
     che chi legge non può aprire: lo sostituisco con link alle pagine del sito.
   - Il piè di `/corso/` aveva «ultimo aggiornamento»: lo sostituisco con il piè di pagina comune.
   - Nessun'altra avvertenza, scusa o badge trovato nelle pagine; nessuna menzione di IA come autore.
2. **Grafica.** Le pagine sono già provate a 390 px. Il piè di pagina nuovo va a capo su telefono.
3. **Piè di pagina** su tutte le pagine:
   - autore: «Giuseppe Bosi, Dottore in Ingegneria Elettronica (V.O.), Professore di Scienze e Tecnologie
     Informatiche»;
   - licenze: testi CC BY 4.0 e codice MIT;
   - link alle pagine Crediti e Privacy.

   Come viene inserito:
   - nelle pagine dell'app, con un modulo comune (`app/src/piede.ts`), nascosto a schermo intero;
   - nelle tre versioni del corso, con la configurazione di ognuna (MkDocs `copyright`, Quarto `page-footer`,
     mdBook una riga aggiunta dal convertitore) e nella pagina di scelta.

   Nel progetto si aggiungono `LICENSE` (MIT, codice) e `LICENSE-TESTI.md` (CC BY 4.0, testi).
4. **Risorse da terzi.** Già nessuna: font di sistema, MediaPipe, modelli e librerie serviti dal sito, CSP
   `default-src 'none'`. Resta così. Il corso cita `unpkg.com` e i modelli Google solo come codice da usare
   nell'editor di p5.js, che è un altro sito: lo dice la pagina Privacy.
5. **Dati personali, segreti, IGE.** Cercati nelle pagine e nel codice pubblicato: nessuno. I commenti del
   codice che nominano Giuseppe non arrivano al browser (Vite li toglie nella compilazione); si ricontrolla
   sul pacchetto compilato.
6. **Link e file di debug.**
   - Le pagine di prova (`prova-scheletro.html`, `prova-suono.html`, `prova-testa.html`) non sono nella build;
     nella build non ci sono nemmeno le mappe del codice (`.map`).
   - Si controllano tutti i link interni di tutte le pagine con un programma.
7. **noindex.** Il blocco Caddy di `mano.giuseppebosi.com` non ha `X-Robots-Tag` e le pagine non hanno
   `<meta name="robots">`: il sito è già indicizzabile, non c'è niente da togliere e Caddy non si tocca.

## Pagina Privacy (contenuto)

- Le immagini della webcam e i punti della mano o del corpo restano nel browser: nessun invio, nessuna
  registrazione. La CSP `connect-src 'self'` impedisce tecnicamente di inviarli altrove.
- Il sito riceve solo due cose, senza cookie:
  - una richiesta vuota a ogni apertura di pagina, per il contatore degli accessi (si salva solo il totale);
  - finché la camera è accesa, un numero casuale per contare le persone collegate insieme, tenuto in memoria
    e dimenticato quando si esce.
- I registri del server web sono disattivati.
- Nessun servizio esterno, nessuna statistica.

## Verifica

- Build e controlli di `deploy/pubblica.sh`.
- `npm run test:e2e` (`E2E OK`).
- Una prova nel browser di ogni pagina sul sito pubblicato, a 1280 e 390 px:
  - nessun errore;
  - nessuno scorrimento laterale;
  - piè di pagina presente;
  - tutti i link interni a 200.
