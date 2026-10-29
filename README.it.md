# Riconoscimento dei gesti della mano

**La webcam vede la tua mano, il tuo corpo e i tuoi gesti, e niente esce dal browser.**

[English](README.md) · **Demo: https://mano.giuseppebosi.com/**

Web app che riconosce mani, gesti e posa del corpo dalla webcam con
[MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker),
tutto sul dispositivo: nessun invio, nessuna registrazione, nessuna statistica, nessuna risorsa di terzi
(lo garantisce una Content Security Policy rigida).

## Cosa contiene

| Pagina | Cosa fa |
|---|---|
| [`/`](https://mano.giuseppebosi.com/) | La mano riprodotta in 3D (Three.js), con il riconoscimento dei gesti |
| [`/sfida/`](https://mano.giuseppebosi.com/sfida/) | Sasso, carta, forbici in due davanti alla stessa webcam |
| [`/onda/`](https://mano.giuseppebosi.com/onda/) | Mani unite per 4 secondi: la palla di energia si carica e parte il raggio |
| [`/corpo/`](https://mano.giuseppebosi.com/corpo/) | I 33 punti del corpo e lo scheletro stilizzato |
| [`/tutorial/`](https://mano.giuseppebosi.com/tutorial/) | Come si costruisce questa app da zero |
| [`/corso/`](https://mano.giuseppebosi.com/corso/) | Corso di TypeScript in 10 lezioni |
| [`/scuola/`](https://mano.giuseppebosi.com/scuola/) | Corso per la scuola con p5.js e ml5.js, in MkDocs, Quarto e mdBook da un'unica sorgente |

## Avvio

```bash
cd app
npm ci
npm run dev        # http://localhost:5173 (la camera vuole localhost o HTTPS)
npm run build      # versione da pubblicare in app/dist
npm run test:e2e   # Chromium senza schermo con una webcam finta: deve finire con "E2E OK"
```

I modelli e la cartella `wasm` di MediaPipe stanno in `app/public/mediapipe/`, con versioni fissate.

## Struttura

```
app/            web app Vite + TypeScript (pagine, sorgenti, test e2e)
corso-scuola/   corso per la scuola: sorgenti Markdown, convertitore, configurazioni MkDocs/Quarto/mdBook
deploy/         server statico Node, frammento Caddy, script di pubblicazione con controlli CSP e privacy
docs/           come funziona, note di ricerca e diario delle decisioni
```

## Licenza

- Codice: [MIT](LICENSE)
- Testi e materiale del corso: [CC BY 4.0](LICENSE-TESTI.md)
- Librerie e modelli di terzi mantengono le loro licenze (modelli MediaPipe: Apache 2.0).

## Autore

**Giuseppe Bosi**, Dottore in Ingegneria Elettronica (V.O.), Professore di Scienze e Tecnologie Informatiche.
[www.giuseppebosi.com](https://www.giuseppebosi.com) · [LinkedIn](https://www.linkedin.com/in/giuseppebosi)
