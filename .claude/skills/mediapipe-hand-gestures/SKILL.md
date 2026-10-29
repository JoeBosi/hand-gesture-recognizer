---
name: mediapipe-hand-gestures
description: Implements, debugs and tunes hand gesture recognition in the browser with MediaPipe Tasks Vision (@mediapipe/tasks-vision) - GestureRecognizer and HandLandmarker setup, webcam frame loop, the 21 hand landmarks, canned gestures (Thumb_Up, Victory, Open_Palm...), custom gestures from landmarks, custom models trained with Model Maker, drawing overlays and performance. Use for any work on recognizing hands, fingers or gestures from the webcam in this project, including Italian requests like "riconosci il gesto", "aggiungi un gesto", "landmark della mano", "pollice in su", "il riconoscimento è lento".
---

# MediaPipe hand gestures (web)

Verificato il 2026-09-17 su `@mediapipe/tasks-vision` **1.0.1** (typings) e doc ufficiale
(aggiornata 2026-08-17). Dettagli e fonti: `docs/research/2026-09-17-mediapipe-gesture-recognizer-web.md`.
Se la versione installata è diversa, rileggi la doc (R2) prima di fidarti di questo file.

## Quale task usare

| Serve | Task | Metodo video |
|---|---|---|
| Uno degli 8 gesti pronti | `GestureRecognizer` | `recognizeForVideo(video, timestampMs)` |
| Gesti propri definiti da regole sui landmark | `HandLandmarker` (o `GestureRecognizer`, che dà anche i landmark) | `detectForVideo(video, timestampMs)` |
| Gesti propri appresi da esempi | `GestureRecognizer` con modello custom (Model Maker) | come sopra |

Gesti pronti: `None`, `Closed_Fist`, `Open_Palm`, `Pointing_Up`, `Thumb_Down`, `Thumb_Up`,
`Victory`, `ILoveYou`.

## Setup

```bash
npm i @mediapipe/tasks-vision@1.0.1
```

```ts
import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm"; // = versione npm
const MODEL = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task";

const vision = await FilesetResolver.forVisionTasks(WASM);
const recognizer = await GestureRecognizer.createFromOptions(vision, {
  baseOptions: { modelAssetPath: MODEL, delegate: "GPU" }, // "CPU" come ripiego
  runningMode: "VIDEO",                                    // "IMAGE" | "VIDEO"
  numHands: 1,
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  cannedGesturesClassifierOptions: { scoreThreshold: 0.6, categoryAllowlist: ["Thumb_Up", "Victory"] },
});
```

Opzioni del classificatore (`cannedGesturesClassifierOptions` / `customGesturesClassifierOptions`):
`scoreThreshold`, `maxResults`, `categoryAllowlist`, `categoryDenylist`, `displayNamesLocale`.
Cambiare modalità a runtime: `await recognizer.setOptions({ runningMode: "IMAGE" })`.

## Loop sulla webcam

```ts
let lastVideoTime = -1;
function loop() {
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const r = recognizer.recognizeForVideo(video, performance.now());
    // r.gestures[i][0]   -> { categoryName, score }   (index sempre -1)
    // r.handedness[i][0] -> { categoryName: "Left" | "Right", score }
    // r.landmarks[i]     -> 21 NormalizedLandmark {x,y in 0..1, z relativa al polso}
    // r.worldLandmarks[i]-> 21 Landmark in metri
  }
  requestAnimationFrame(loop);
}
```
Acquisizione della webcam e regole privacy: skill `webcam-capture`.

## I 21 landmark

`0` polso · pollice `1-4` (CMC, MCP, IP, TIP) · indice `5-8` (MCP, PIP, DIP, TIP) ·
medio `9-12` · anulare `13-16` · mignolo `17-20`. Punte: `4, 8, 12, 16, 20`.
Connessioni per il disegno: `GestureRecognizer.HAND_CONNECTIONS`.

Gesto custom a regole (esempio "pinch"): distanza fra `4` e `8` normalizzata sulla dimensione
della mano (distanza `0`–`9`), sotto una soglia per **N frame consecutivi** — mai su un frame solo.
Usare `worldLandmarks` quando conta la geometria reale (indipendente dalla distanza dalla camera).

## Disegno

```ts
import { DrawingUtils } from "@mediapipe/tasks-vision";
const du = new DrawingUtils(canvas.getContext("2d")!);
for (const lm of r.landmarks) {
  du.drawConnectors(lm, GestureRecognizer.HAND_CONNECTIONS);
  du.drawLandmarks(lm, { radius: 3 });
}
```

## Modello custom (Model Maker, Python)

Dataset `<dataset>/<label>/<img>.*`, con **obbligatoriamente** una classe `none`.
`gesture_recognizer.Dataset.from_folder(..., hparams=HandDataPreprocessingParams())` →
`GestureRecognizer.create(train_data, validation_data, options=GestureRecognizerOptions(hparams=HParams(export_dir=...)))`
→ `model.evaluate(test_data)` → `model.export_model()` → `gesture_recognizer.task`.
Nel web: `modelAssetPath` punta al `.task` custom e i filtri vanno in `customGesturesClassifierOptions`.
Le foto del dataset sono dati personali: vedi `.claude/memory/feedback-privacy-on-device.md`.

## Trappole

- **Timestamp crescenti** in modalità VIDEO: mai lo stesso valore o uno minore (errore del task).
- **wasm e npm alla stessa versione**; la doc usa `@latest`, qui no.
- **Specchio**: il video selfie si mostra con `transform: scaleX(-1)`, ma i landmark sono sul frame
  non specchiato → specchiare anche il canvas, non le coordinate a mano in due posti.
  La doc indica che la handedness presuppone input specchiato: verificare Left/Right con un test reale.
- **Una sola istanza**: creare il task una volta; `recognizer.close()` prima di ricrearlo o all'uscita.
- **Main thread bloccato**: i metodi sono sincroni; se la UI scatta, spostare l'inferenza in un Web Worker
  (suggerito dalla doc) o saltare frame.
- **GPU**: se `delegate: "GPU"` fallisce in `createFromOptions`, riprovare con `"CPU"`.
- **Privacy/offline in produzione**: servire wasm e `.task` dal proprio dominio invece che da CDN.
  Il runtime non-module usato da `forVisionTasks(path)` è `vision_wasm_internal.{js,wasm}` più la
  variante `vision_wasm_nosimd_internal.*`; CSP necessaria: `script-src 'self' 'wasm-unsafe-eval'`.
- **Telemetria**: la 1.0.1 invia metriche d'uso a `https://odml.pa.googleapis.com/v1/log` senza
  opzione per spegnerla. Qui è neutralizzata in build (`app/vite.config.ts`) e bloccata dalla CSP.
- **Handedness verificata** (2026-09-17, foto di mano sinistra dei test MediaPipe): sul frame non
  specchiato l'etichetta è invertita → `Left` significa mano destra reale e viceversa.
- **Falsi positivi**: con `numHands: 2` compare a volte una seconda mano per un solo frame nei cambi
  bruschi; mostrare una mano solo dopo 3 rilevazioni consecutive.
- **Headless**: in Chromium senza GPU il delegate GPU impiega ~3 s a frame; la CPU fa 4–6 fps.
