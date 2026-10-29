# Prima versione dell'app: scoperte verificate — 2026-09-17

Task: goal "la camera guarda la mano e la riproduce sullo schermo, su mano.giuseppebosi.com".

## Versioni (registry npm, 2026-09-17)
three 0.186.0 · @types/three 0.186.0 · vite 8.3.0 (il template `create vite` usa typescript ~6.0.2
e `erasableSyntaxOnly`: niente parameter properties nei costruttori) · @mediapipe/tasks-vision 1.0.1 ·
playwright 1.63.0 (browser già presenti in `~/.cache/ms-playwright` sul VPS).

## MediaPipe servito dal proprio dominio
- `FilesetResolver.forVisionTasks(base)` prova un piccolo modulo WebAssembly SIMD e sceglie
  `vision_wasm_internal.{js,wasm}` oppure `vision_wasm_nosimd_internal.{js,wasm}` (varianti `_module_`
  solo con `useModule=true`). Il `.js` è caricato con un `<script>` creato dinamicamente → basta
  `script-src 'self'`; la compilazione wasm richiede `'wasm-unsafe-eval'`.
- Modello: `.../gesture_recognizer/float16/1/gesture_recognizer.task` (versione fissata) ha lo stesso
  sha256 di `latest` al 2026-09-17: `97952348…2b0482`, 8 373 440 byte.
- Caddy serve `.wasm` con `Content-Type: application/wasm` (verificato con curl sul Caddy locale).

## Telemetria di @mediapipe/tasks-vision 1.0.1
Scoperta perché la CSP `connect-src 'self'` ha bloccato, nel test, una fetch verso
`https://odml.pa.googleapis.com/v1/log`. Nel bundle ogni task crea un logger (classe minificata con
`flush()` ogni 60 s, POST protobuf con `x-goog-api-key` preso dal wasm) che invia tipo di task,
modalità e contatori di latenza. Nessuna immagine, ma è comunque una chiamata a terzi.
Nessuna opzione pubblica per disattivarlo nei typings (`enableLogging` esiste ma non disattiva).
Ricerca web: nessuna documentazione ufficiale sull'endpoint (solo la issue sui log in console
https://github.com/google-ai-edge/mediapipe/issues/5619).
Soluzione: plugin in `app/vite.config.ts` che rende `flush()` una no-op; la build fallisce se il
pattern `flush(t,e){if(this.error)` non esiste più. Dopo la patch il minificatore elimina anche l'URL.

## Handedness
Foto `victory.jpg` dei test MediaPipe (mano sinistra, palmo verso la camera, verificata a vista):
l'app, invertendo l'etichetta di MediaPipe, riporta `Left` in tutti i frame → conferma che su frame
non specchiati l'etichetta di MediaPipe è quella opposta alla mano reale.

## Headless Chromium
- Il delegate GPU funziona (WebGL emulato) ma impiega ~3–4 s a rilevazione; la CPU (XNNPACK) 4–6 fps.
  Da qui il ripiego automatico su CPU in `app/src/main.ts` se la media supera 150 ms.
- Flag webcam finta: `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream
  --use-file-for-fake-video-capture=<file.mjpeg>` (MJPEG accettato, ~10 MB per 10 s a 640×480).
- `page.addInitScript` gira prima che esista il DOM: i `MutationObserver` vanno agganciati su `DOMContentLoaded`.
- ESM ignora `NODE_PATH`: Playwright va installato come dipendenza del progetto.

## Falsi positivi
Con `numHands: 2`, sul video con tagli netti fra foto, 2 frame su 117 avevano una seconda mano
inesistente. Mostrare una mano solo dopo 3 rilevazioni consecutive li elimina (0 nel test successivo).
