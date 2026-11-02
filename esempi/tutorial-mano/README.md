# tutorial-mano

The complete, small example behind the **Tutorial** of the Mano site
(https://mano.giuseppebosi.com/tutorial/): a webcam, MediaPipe Tasks Vision for the 21 hand
points and the gesture name, Three.js for a 3D hand, a One Euro filter against jitter.
Everything runs **in the browser**: webcam frames never leave it (no upload, no analytics).

## Files

| File | What it does |
|---|---|
| `index.html` | the single page |
| `src/main.ts` | the director: page state and the frame loop |
| `src/camera.ts` | turns the webcam on and off |
| `src/tracker.ts` | MediaPipe: from pixels to the 21 points and the gesture |
| `src/filter.ts` | the anti-jitter filter |
| `src/hand3d.ts` | the 3D scene and the stylized hand (Three.js) |
| `src/style.css` | the look |

## Try it online (no install, no account)

Open the folder in StackBlitz:
https://stackblitz.com/github/JoeBosi/hand-gesture-recognizer/tree/main/esempi/tutorial-mano

The webcam does not work inside StackBlitz's embedded preview (browsers deny the camera to
embedded frames from another site). Open the preview in its own tab with the "open in new tab"
icon, then press "Turn on the camera".

## Run it on your computer

```bash
npm install
npm run dev      # http://localhost:5173/  (localhost counts as a secure context: the camera works)
npm run build    # type check + production build in dist/
```

Needs Node.js 20.19 or newer (22 recommended).

## Test it without a webcam

`tests/fake-webcam/` runs the built page in headless Chromium with a fake webcam (a video file):

```bash
bash tests/fake-webcam/make-video.sh        # builds hand.mjpeg (needs curl and ffmpeg)
npm install --save-dev playwright@1.63.0
npx playwright install chromium
npm run build
npx vite preview --port 4173 &              # serves dist/ on http://localhost:4173/
node tests/fake-webcam/run.mjs http://localhost:4173/ tests/fake-webcam/hand.mjpeg
```

Expected output:

```
state: running | hands: 1 | side: Left | gesture: Thumb_Up
after stop: video.srcObject is null, the camera is released
errors: none
```

## Differences from the real site

* `src/tracker.ts` loads the WebAssembly runtime from jsDelivr (version 1.0.1, pinned) and the
  model from Google's public model storage (version `1`), so the example works without a
  download step. The real site copies both files into its own `public/mediapipe/` and serves them
  itself, because its Content Security Policy only allows requests to its own domain.
* The user interface text is in English here.
* Versions are pinned: `@mediapipe/tasks-vision` 1.0.1, `three` 0.186.0, never `latest`.

## Privacy note

`vite.config.ts` switches off the usage metrics that `@mediapipe/tasks-vision` 1.0.1 would send
to a Google endpoint every 60 seconds (no images, but still a call to a third party). The
jsDelivr and Google addresses above are downloads only: nothing is uploaded.
