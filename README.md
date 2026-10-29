# Hand Gesture Recognizer

**Your webcam sees your hand, your body and your gestures — and nothing ever leaves your browser.**

[Italiano](README.it.md) · **Live demo: https://mano.giuseppebosi.com/**

A web app that recognizes hands, gestures and body pose from the webcam with
[MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker),
entirely on-device: no uploads, no recordings, no analytics, no third-party resources
(enforced by a strict Content Security Policy).

## What's inside

| Page | What it does |
|---|---|
| [`/`](https://mano.giuseppebosi.com/) | Your hand reproduced in 3D (Three.js), with gesture recognition |
| [`/sfida/`](https://mano.giuseppebosi.com/sfida/) | Rock, paper, scissors for two players in front of one webcam |
| [`/onda/`](https://mano.giuseppebosi.com/onda/) | Hold a two-hand pose for 4 s to charge an energy ball and fire a beam |
| [`/corpo/`](https://mano.giuseppebosi.com/corpo/) | 33 body landmarks and a stylized skeleton |
| [`/tutorial/`](https://mano.giuseppebosi.com/tutorial/) | How to build this app from scratch (Italian) |
| [`/corso/`](https://mano.giuseppebosi.com/corso/) | A 10-lesson TypeScript course (Italian) |
| [`/scuola/`](https://mano.giuseppebosi.com/scuola/) | A school course with p5.js + ml5.js, built with MkDocs, Quarto and mdBook from one source |

## Quick start

```bash
cd app
npm ci
npm run dev        # http://localhost:5173 (camera needs localhost or HTTPS)
npm run build      # production build in app/dist
npm run test:e2e   # headless Chromium with a fake webcam video, must end with "E2E OK"
```

Model files and the MediaPipe `wasm` folder are served from `app/public/mediapipe/`, with pinned versions.

## Structure

```
app/            Vite + TypeScript web app (pages, sources, e2e tests)
corso-scuola/   school course: Markdown sources, converter, MkDocs/Quarto/mdBook configs
deploy/         Node static server, Caddy snippet, publish script with CSP and privacy checks
docs/           architecture notes, research notes and decision journal (Italian)
```

Most comments and documentation are in Italian: the project is used in Italian classrooms.

## License

- Code: [MIT](LICENSE)
- Texts and course material: [CC BY 4.0](LICENSE-TESTI.md)
- Third-party libraries and models keep their own licenses (MediaPipe models: Apache 2.0).

## Author

**Giuseppe Bosi** — Dottore in Ingegneria Elettronica (V.O.), Professore di Scienze e Tecnologie Informatiche.
[www.giuseppebosi.com](https://www.giuseppebosi.com) · [LinkedIn](https://www.linkedin.com/in/giuseppebosi)
