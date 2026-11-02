# Lesson 09 - Classes, state, filter

Runnable example for lesson 09 of the TypeScript course ("From zero to a hand that copies you"),
Italian: https://mano.giuseppebosi.com/corso/ - English: https://mano.giuseppebosi.com/en/corso/

It holds the code of the whole lesson (the solutions of exercises 9.1-9.6). Identifiers and
comments are in Italian on purpose: they are the same as on the course page.

## Try it with nothing to install

Open it in StackBlitz (free, no account needed):
https://stackblitz.com/github/JoeBosi/hand-gesture-recognizer/tree/main/esempi/corso-ts/lezione-09?file=src%2Fmain.ts

The webcam does not work inside the preview frame: open the preview in a new tab (icon next to the preview address)
and press "Accendi la camera". Chrome or Edge recommended.

## Run it on your computer

    npm install
    npm run dev       # then open the address it prints (localhost is a secure context: the camera works)
    npm run build     # type check + production build into dist/

## Notes

- `@mediapipe/tasks-vision` is pinned to 1.0.1 and the WebAssembly runtime is loaded from the same pinned
  version on jsDelivr; the model file comes from Google's storage. **The webcam frames never leave the
  browser**: they are processed locally; only the library and the model are downloaded.
- Versions of Vite, TypeScript are pinned to the ones the example was tested with.
- Tested from a clean `npm install` with `tsc --noEmit` and `vite build`, then run in Chromium with a fake webcam.

- `src/prova.ts` is the console test of exercise 9.1: add `import "./prova";` to `main.ts` to run it.
- Lessons 9 and 10 use a single hand (`numHands: 1`) and `src/camera.ts` (the homework of lesson 7).
