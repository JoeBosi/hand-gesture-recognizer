# MediaPipe Gesture Recognizer per il web — 2026-09-17

Task: preparare l'ambiente agentico di Recognizer-Mano (gesti mano da webcam, nel browser).

## Fonti
- Doc ufficiale Gesture Recognizer Web (ultimo aggiornamento 2026-08-17):
  https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js
  (il vecchio URL `ai.google.dev/edge/mediapipe/...` fa redirect 301 qui)
- Personalizzazione con Model Maker (aggiornata 2026-06-05):
  https://developers.google.com/edge/mediapipe/solutions/customization/gesture_recognizer
- Typings del pacchetto: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision.d.ts`, versione 1.0.1
  (confermata anche da `npm view @mediapipe/tasks-vision version`).
- MDN getUserMedia: https://developer.mozilla.org/docs/Web/API/MediaDevices/getUserMedia

## Fatti verificati
- Pacchetto `@mediapipe/tasks-vision` **1.0.1**. wasm via `FilesetResolver.forVisionTasks(basePath)`.
- `GestureRecognizer.createFromOptions(vision, options)`; `baseOptions.delegate?: "CPU" | "GPU"`;
  `runningMode: "IMAGE" | "VIDEO"`.
- Opzioni: `numHands` (default 1), `minHandDetectionConfidence`, `minHandPresenceConfidence`,
  `minTrackingConfidence` (default 0.5), `cannedGesturesClassifierOptions`,
  `customGesturesClassifierOptions` → `ClassifierOptions { displayNamesLocale, maxResults,
  scoreThreshold, categoryAllowlist, categoryDenylist }`.
- Firme (dai typings): `recognize(image, imageProcessingOptions?)`,
  `recognizeForVideo(videoFrame, timestamp, imageProcessingOptions?)`. Nota: lo snippet della doc
  omette il timestamp, i typings lo richiedono.
- Risultato: `landmarks: NormalizedLandmark[][]`, `worldLandmarks: Landmark[][]`,
  `handedness: Category[][]` (`handednesses` deprecato), `gestures: Category[][]` (index sempre -1).
- Gesti pronti: None, Closed_Fist, Open_Palm, Pointing_Up, Thumb_Down, Thumb_Up, Victory, ILoveYou.
- `HandLandmarker.detectForVideo(videoFrame, timestamp, …)`; `HAND_CONNECTIONS` statico;
  `DrawingUtils.drawConnectors / drawLandmarks`.
- Modelli raggiungibili (HTTP 200):
  `https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task`,
  `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task`.
- Model Maker: dataset `<dataset>/<label>/<img>`, classe `none` obbligatoria; `Dataset.from_folder`
  + `HandDataPreprocessingParams`, `GestureRecognizer.create`, `evaluate`, `export_model` → `gesture_recognizer.task`.
- La doc suggerisce Web Worker per non bloccare la UI in modalità video.

## Skill esterne valutate (R1)
Ricerca `npx skills find` per: mediapipe, hand gesture, hand tracking, computer vision, webcam,
tensorflow.js, vite react, pwa.
- `liuchiawei/agent-skills@mediapipe-usage` (57 install, 2 stelle, nessuna licenza): letto, copre
  **solo Pose Landmarker** e usa wasm `@latest` → scartata.
- `alphaonedev/openclaw-graph@hand-tracking`: repository GitHub non trovato (404) → scartata.
- `kinemotioninc/kinemotion@mediapipe-pose-detection`: pose del corpo, non mani → scartata.
- Skill generiche di computer vision (OpenCV, Python) e React/Vite/PWA: fuori tema finché lo stack UI è TBD.
Esito: skill locale `mediapipe-hand-gestures` scritta dalle fonti ufficiali sopra.

## Da ricontrollare
- Comportamento reale di `handedness` con webcam non specchiata (la doc legacy lo descrive per input specchiato).
- Quando si sceglie il framework UI, rifare R1 (es. skill Vite/React) e annotare qui.
